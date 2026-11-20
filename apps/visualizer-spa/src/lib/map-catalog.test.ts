/**
 * Разбор и загрузка /maps/index.json на стороне браузера.
 */
import { describe, expect, test } from 'bun:test';
import { fetchMapCatalog, parseMapCatalog } from './map-catalog';

const entry = {
  id: 'korbor-site',
  label: 'Сайт',
  path: '/maps/korbor-site.liveappmap.json',
  baseUrl: 'http://localhost:16001',
  pageCount: 35,
};

function fakeFetch(status: number, body: string): typeof fetch {
  const fn = async (): Promise<Response> => new Response(body, { status });
  return Object.assign(fn, { preconnect: fetch.preconnect });
}

describe('parseMapCatalog', () => {
  test('валидный каталог', () => {
    const res = parseMapCatalog({ version: 1, maps: [entry], skipped: [{ file: 'x', reason: 'y' }] });
    expect(res).toEqual({ ok: true, catalog: { version: 1, maps: [entry], skipped: [{ file: 'x', reason: 'y' }] } });
  });

  test('чужая версия и битая запись — ошибка с причиной', () => {
    const v2 = parseMapCatalog({ version: 2, maps: [] });
    expect(v2.ok).toBe(false);
    expect(v2.ok ? '' : v2.error).toContain('версия 2');
    const bad = parseMapCatalog({ version: 1, maps: [{ ...entry, pageCount: -1 }] });
    expect(bad.ok ? '' : bad.error).toContain('битая запись');
    expect(parseMapCatalog(null).ok).toBe(false);
  });
});

describe('fetchMapCatalog', () => {
  test('200 → каталог', async () => {
    const res = await fetchMapCatalog(fakeFetch(200, JSON.stringify({ version: 1, maps: [entry] })));
    expect(res.ok && res.catalog.maps).toEqual([entry]);
  });

  test('404 и не-JSON → понятная ошибка', async () => {
    const r404 = await fetchMapCatalog(fakeFetch(404, 'nope'));
    expect(r404).toEqual({ ok: false, error: 'Каталог карт /maps/index.json: HTTP 404' });
    const html = await fetchMapCatalog(fakeFetch(200, '<html>'));
    expect(html.ok).toBe(false);
  });
});
