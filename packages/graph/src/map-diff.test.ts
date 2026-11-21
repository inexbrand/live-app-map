/**
 * Сравнение двух версий карты: экраны, связи, роуты и таблицы раздела code.
 */
import { describe, expect, test } from 'bun:test';
import type { ApiRoute, AppMapDocument, CodeModel, DbTable } from '@live-app-map/schema';
import { diffChangeCount, diffDocuments } from './index';

const LOC = { file: 'api.ts', line: 1 };

function route(id: string, extra: Partial<ApiRoute> = {}): ApiRoute {
  return {
    id,
    framework: 'elysia',
    method: 'GET',
    path: `/${id}`,
    serviceId: 'api',
    location: LOC,
    handler: { location: LOC },
    dbCalls: [],
    ...extra,
  };
}

function table(id: string, columns: DbTable['columns']): DbTable {
  return { id, orm: 'drizzle', name: id, exportName: id, serviceId: 'api', location: LOC, columns };
}

function doc(revision: string, code: Partial<CodeModel>): AppMapDocument {
  return {
    formatVersion: 2,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision,
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5175',
    nodes: [],
    edges: [],
    code: { root: '/repo', services: [], symbols: [], routes: [], tables: [], ...code },
  };
}

describe('diffDocuments: раздел code', () => {
  const left = doc('L', {
    routes: [route('a'), route('b', { input: { body: { kind: 'typebox', fields: [{ name: 'x', type: 'string' }] } } }), route('moved')],
    tables: [
      table('users', [
        { name: 'id', type: 'text' },
        { name: 'age', type: 'integer' },
        { name: 'gone', type: 'text' },
      ]),
      table('old', []),
    ],
  });
  const right = doc('R', {
    routes: [
      route('b', { input: { body: { kind: 'typebox', fields: [{ name: 'x', type: 'number' }] } }, access: { auth: true } }),
      route('c'),
      route('moved', { location: { file: 'api.ts', line: 40 } }),
    ],
    tables: [
      table('users', [
        { name: 'id', type: 'text' },
        { name: 'age', type: 'text', notNull: true },
        { name: 'email', type: 'text' },
      ]),
      table('fresh', []),
    ],
  });
  const d = diffDocuments(left, right);

  test('роуты: добавлены, пропали, изменились вход и доступ; сдвиг строки — не изменение', () => {
    expect(d.routes.added).toEqual(['c']);
    expect(d.routes.removed).toEqual(['a']);
    expect(d.routes.changed).toEqual([{ id: 'b', fields: ['input', 'access'] }]);
  });

  test('таблицы: добавлены, пропали, колонки по именам', () => {
    expect(d.tables.added).toEqual(['fresh']);
    expect(d.tables.removed).toEqual(['old']);
    expect(d.tables.changed).toEqual([{ id: 'users', columns: { added: ['email'], removed: ['gone'], changed: ['age'] } }]);
  });

  test('число изменений: роуты 3, таблицы 3; одинаковые версии — 0', () => {
    expect(diffChangeCount(d)).toBe(6);
    expect(diffChangeCount(diffDocuments(left, left))).toBe(0);
  });

  test('карты без code — пустые разделы', () => {
    const bare = diffDocuments({ ...left, code: undefined }, { ...right, code: undefined });
    expect(bare.routes).toEqual({ added: [], removed: [], changed: [] });
    expect(bare.tables).toEqual({ added: [], removed: [], changed: [] });
  });
});
