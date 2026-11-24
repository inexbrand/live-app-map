/**
 * Каталог карт из настоящей папки: копии настоящих карт и временная папка.
 */
import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { testMapPath } from '../test/fixtures';
import { buildMapCatalog, summarizeMapFile, withExtraMaps, writeMapCatalogIndex } from './build-map-catalog-fs';
import { parseMapCatalog } from './map-catalog';

const publicMaps = path.resolve(import.meta.dir, '../../public/maps');

/** Экраны файла карты: сервисы и внешние ссылки экранами не считаются. */
function screensIn(file: string): number {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { pages: Array<{ type?: string }> };
  return doc.pages.filter((p) => p.type !== 'service' && p.type !== 'external').length;
}

describe('buildMapCatalog — папка с настоящими картами', () => {
  test('карты по id, подпись — имя приложения из карты, baseUrl — из карты, экраны без сервисов', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lam-catalog-real-'));
    copyFileSync(testMapPath('korbor-site'), path.join(dir, 'korbor-site.liveappmap.json'));
    copyFileSync(testMapPath('korbor-miniapp'), path.join(dir, 'korbor-miniapp.liveappmap.json'));
    copyFileSync(path.join(publicMaps, 'live-app-map.liveappmap.json'), path.join(dir, 'live-app-map.liveappmap.json'));
    const catalog = buildMapCatalog(dir);
    expect(catalog.skipped).toEqual([]);
    expect(catalog.maps.map((m) => m.id)).toEqual(['korbor-miniapp', 'korbor-site', 'live-app-map']);
    const site = catalog.maps[1];
    expect(site).toEqual({
      id: 'korbor-site',
      label: 'site',
      path: '/maps/korbor-site.liveappmap.json',
      baseUrl: 'http://localhost:16001',
      pageCount: screensIn(testMapPath('korbor-site')),
    });
    // В карте сайта рядом с экранами лежат сервисы монорепо — подпись «N экр.» их не считает.
    expect(site?.pageCount).toBeLessThan((JSON.parse(readFileSync(testMapPath('korbor-site'), 'utf8')) as { pages: unknown[] }).pages.length);
    // Каталог проходит разбор браузерной стороны
    expect(parseMapCatalog(JSON.parse(JSON.stringify(catalog))).ok).toBe(true);
  });

  test('withExtraMaps: карты вне папки (проект) и их пропуски — первыми', () => {
    const extra = { id: 'korbor', label: 'korbor', path: '/__lam_project/map.json', baseUrl: 'http://x', pageCount: 3 };
    const base = { version: 1, maps: [{ ...extra, id: 'a', path: '/maps/a.liveappmap.json' }], skipped: [{ file: 'b', reason: 'r' }] };
    expect(withExtraMaps(base, { maps: [extra], skipped: [{ file: 'map.json', reason: 'нет' }] })).toEqual({
      version: 1,
      maps: [extra, base.maps[0]],
      skipped: [{ file: 'map.json', reason: 'нет' }, { file: 'b', reason: 'r' }],
    });
  });
});

describe('writeMapCatalogIndex — временная папка', () => {
  test('чужая карта берёт подпись и baseUrl из своего JSON, битый файл — в skipped', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lam-maps-'));
    copyFileSync(
      path.resolve(publicMaps, '../examples/demo-shop.liveappmap.json'),
      path.join(dir, 'demo-shop.liveappmap.json'),
    );
    writeFileSync(path.join(dir, 'broken.liveappmap.json'), '{not json');
    writeFileSync(path.join(dir, 'notes.json'), '{}');

    const catalog = writeMapCatalogIndex(dir);
    expect(catalog.maps).toEqual([
      {
        id: 'demo-shop',
        label: 'Demo Shop',
        path: '/maps/demo-shop.liveappmap.json',
        baseUrl: 'http://localhost:5173',
        pageCount: 5,
      },
    ]);
    expect(catalog.skipped.map((s) => s.file)).toEqual(['broken.liveappmap.json']);
    const onDisk: unknown = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(catalog)));
  });

  test('повторный вызов без изменений не переписывает index.json', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lam-maps-'));
    copyFileSync(
      path.resolve(publicMaps, '../examples/demo-shop.liveappmap.json'),
      path.join(dir, 'demo-shop.liveappmap.json'),
    );
    writeMapCatalogIndex(dir);
    const first = statSync(path.join(dir, 'index.json')).mtimeMs;
    await Bun.sleep(20);
    writeMapCatalogIndex(dir);
    expect(statSync(path.join(dir, 'index.json')).mtimeMs).toBe(first);
  });

  test('нет папки — пустой каталог без исключения', () => {
    expect(writeMapCatalogIndex('/nonexistent/lam-maps').maps).toEqual([]);
  });
});
describe('summarizeMapFile — форматы файла', () => {
  const liveText = readFileSync(testMapPath('korbor-miniapp'), 'utf8');

  test('внутренний формат AppMap: имя проекта, baseUrl и экраны — как у исходной карты', () => {
    const live = parseLiveAppMapJson(liveText);
    if (!live.ok) {
      throw new Error('карта не разобралась');
    }
    const fromLive = summarizeMapFile('a.json', liveText);
    const fromApp = summarizeMapFile('a.json', JSON.stringify(liveAppMapToAppMap(live.document)));
    expect(fromApp.ok).toBe(true);
    expect(fromApp.ok && fromLive.ok ? fromApp.summary.pageCount : -1).toBe(screensIn(testMapPath('korbor-miniapp')));
    expect(fromApp.ok && fromLive.ok ? fromApp.summary.baseUrl : 'x').toBe(fromLive.ok ? fromLive.summary.baseUrl : 'y');
  });

  test('не JSON и JSON без карты — причина отказа', () => {
    const broken = summarizeMapFile('b.json', '{oops');
    expect(broken.ok ? '' : broken.reason).toStartWith('JSON:');
    const other = summarizeMapFile('c.json', '{"hello":1}');
    expect(other.ok).toBe(false);
    expect(other.ok ? '' : other.reason).not.toBe('');
  });
});
