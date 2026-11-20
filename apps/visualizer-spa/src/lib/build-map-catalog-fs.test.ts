/**
 * Каталог карт из настоящей папки: реальные public/maps и временная папка.
 */
import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMapCatalog, writeMapCatalogIndex } from './build-map-catalog-fs';
import { parseMapCatalog } from './map-catalog';

const publicMaps = path.resolve(import.meta.dir, '../../public/maps');

describe('buildMapCatalog — public/maps', () => {
  test('все карты Korbor в каталоге, пресеты первыми, подписи и baseUrl из пресетов', () => {
    const catalog = buildMapCatalog(publicMaps);
    expect(catalog.skipped).toEqual([]);
    expect(catalog.maps.map((m) => m.id)).toEqual([
      'korbor-all',
      'korbor-miniapp',
      'korbor-admin',
      'korbor-site',
    ]);
    const mini = catalog.maps[1];
    expect(mini).toEqual({
      id: 'korbor-miniapp',
      label: 'Мини-приложение',
      path: '/maps/korbor-miniapp.liveappmap.json',
      baseUrl: 'https://vite.localhost:5175',
      pageCount: 16,
    });
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
