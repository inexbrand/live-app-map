/**
 * Глобальный поиск на настоящей карте korbor-all.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson, type AppMapDocument } from '@live-app-map/schema';
import { buildSearchIndex, searchIndex, type SearchItem } from './global-search';

const MAPS = path.resolve(import.meta.dir, '../../../../maps');
let korbor: AppMapDocument;
let index: SearchItem[];

beforeAll(() => {
  const res = parseLiveAppMapJson(readFileSync(path.join(MAPS, 'korbor-all.liveappmap.json'), 'utf8'));
  if (!res.ok) {
    throw new Error('korbor-all не разобрана');
  }
  korbor = liveAppMapToAppMap(res.document);
  index = buildSearchIndex(korbor);
});

describe('buildSearchIndex', () => {
  test('в индексе все роуты, таблицы, эпохи и экраны карты', () => {
    const count = (k: string) => index.filter((i) => i.kind === k).length;
    expect(count('route')).toBe(korbor.code?.routes.length ?? -1);
    expect(count('table')).toBe(korbor.code?.tables.length ?? -1);
    expect(count('epoch')).toBe(korbor.docs?.epochs.length ?? -1);
    expect(count('screen')).toBe(korbor.nodes.filter((n) => n.kind !== 'service').length);
    expect(count('file')).toBeGreaterThan(0);
  });
});

describe('searchIndex', () => {
  test('роут по пути: первым идёт точный роут', () => {
    const hits = searchIndex(index, 'telegram-login');
    const route = hits.find((h) => h.kind === 'route');
    expect(route?.title).toContain('/api/v1/auth/web/telegram-login');
    expect(route?.target).toEqual({ kind: 'route', routeId: route?.target.kind === 'route' ? route.target.routeId : '' });
  });

  test('таблица по имени выше подстрок', () => {
    const hits = searchIndex(index, 'vacancies').filter((h) => h.kind === 'table');
    expect(hits[0]?.title).toBe('vacancies');
  });

  test('эпоха по slug ведёт в каталог эпохи', () => {
    const e = searchIndex(index, 'perf-load-test').find((h) => h.kind === 'epoch');
    expect(e?.target.kind).toBe('doc');
    expect(e?.target.kind === 'doc' ? e.target.path : '').toMatch(/^docs\/epoch\/perf-load-test#/);
    expect(e?.detail).toContain('не готово');
  });

  test('несколько слов сужают: «GET me» — только роуты с обоими словами', () => {
    const hits = searchIndex(index, 'get /me').filter((h) => h.kind === 'route');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.title.toLowerCase().includes('get') && h.text.includes('/me'))).toBe(true);
  });

  test('роуты выше файлов; точное название поднимает свою группу', () => {
    const hits = searchIndex(index, 'vacancies');
    const firstRoute = hits.findIndex((h) => h.kind === 'route');
    const firstFile = hits.findIndex((h) => h.kind === 'file');
    expect(firstRoute).toBeGreaterThanOrEqual(0);
    expect(firstRoute).toBeLessThan(firstFile);
    expect(searchIndex(index, 'perf-load-test')[0]?.kind).toBe('epoch');
  });

  test('пустой запрос — пусто; предел строк в группе соблюдён', () => {
    expect(searchIndex(index, '   ')).toEqual([]);
    const many = searchIndex(index, 'a', 3);
    const kinds = new Map<string, number>();
    many.forEach((h) => kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1));
    expect([...kinds.values()].every((n) => n <= 3)).toBe(true);
  });
});
