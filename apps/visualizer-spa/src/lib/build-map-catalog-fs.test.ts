/**
 * Каталог карт из настоящей папки: реальные public/maps и временная папка.
 */
import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { buildMapCatalog, summarizeMapFile, writeMapCatalogIndex } from './build-map-catalog-fs';
import { parseMapCatalog } from './map-catalog';

const publicMaps = path.resolve(import.meta.dir, '../../public/maps');

/** Экраны файла карты: сервисы и внешние ссылки экранами не считаются. */
function screensIn(id: string): number {
  const doc = JSON.parse(readFileSync(path.join(publicMaps, `${id}.liveappmap.json`), 'utf8')) as { pages: Array<{ type?: string }> };
  return doc.pages.filter((p) => p.type !== 'service' && p.type !== 'external').length;
}

describe('buildMapCatalog — public/maps', () => {
  test('все карты Korbor в каталоге, пресеты первыми, подписи и baseUrl из пресетов', () => {
    const catalog = buildMapCatalog(publicMaps);
    expect(catalog.skipped).toEqual([]);
    // Пресеты Korbor первыми, за ними прочие карты папки (live-app-map — карта самого репо).
    expect(catalog.maps.map((m) => m.id)).toEqual([
      'korbor-all',
      'korbor-miniapp',
      'korbor-admin',
      'korbor-site',
      'live-app-map',
    ]);
    const mini = catalog.maps[1];
    expect(mini).toEqual({
      id: 'korbor-miniapp',
      label: 'Мини-приложение',
      path: '/maps/korbor-miniapp.liveappmap.json',
      baseUrl: 'https://vite.localhost:5175',
      pageCount: screensIn('korbor-miniapp'),
    });
    expect(mini?.pageCount).toBeGreaterThan(0);
    // В карте сайта рядом с экранами лежат сервисы монорепо — подпись «N экр.» их не считает.
    const site = catalog.maps.find((m) => m.id === 'korbor-site');
    expect(site?.pageCount).toBe(screensIn('korbor-site'));
    expect(site?.pageCount).toBeLessThan((JSON.parse(readFileSync(path.join(publicMaps, 'korbor-site.liveappmap.json'), 'utf8')) as { pages: unknown[] }).pages.length);
    // Каталог проходит разбор браузерной стороны
    expect(parseMapCatalog(JSON.parse(JSON.stringify(catalog))).ok).toBe(true);
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
  const liveText = readFileSync(path.join(publicMaps, 'korbor-miniapp.liveappmap.json'), 'utf8');

  test('внутренний формат AppMap: имя проекта, baseUrl и экраны — как у исходной карты', () => {
    const live = parseLiveAppMapJson(liveText);
    if (!live.ok) {
      throw new Error('карта не разобралась');
    }
    const fromLive = summarizeMapFile('a.json', liveText);
    const fromApp = summarizeMapFile('a.json', JSON.stringify(liveAppMapToAppMap(live.document)));
    expect(fromApp.ok).toBe(true);
    expect(fromApp.ok && fromLive.ok ? fromApp.summary.pageCount : -1).toBe(screensIn('korbor-miniapp'));
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
