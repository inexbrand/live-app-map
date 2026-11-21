/**
 * Выбор кода для панели ноды: сервис → роуты/таблицы, экран → символы его файла.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { runScan } from '@live-app-map/cli';
import type { AppMapDocument } from '@live-app-map/schema';
import { filterCanvasGraph } from '../flow/canvas-graph';
import { matchesCodeFilter } from './code-filter';
import { groupDbCalls, selectNodeCode } from './node-code';

const FIXTURES = path.resolve(import.meta.dir, '../../../../fixtures');

/** Карта: экраны next-фикстуры + исходники source-monorepo (настоящий скан). */
async function scannedMap(): Promise<AppMapDocument> {
  const res = await runScan({
    dir: path.join(FIXTURES, 'next-app-router-basic'),
    codeDir: path.join(FIXTURES, 'source-monorepo'),
  });
  return res.document;
}

describe('selectNodeCode', () => {
  test('сервис: его роуты с описанием, таблицы — свои и те, куда ходят роуты', async () => {
    const doc = await scannedMap();
    const view = selectNodeCode(doc, 'service:@fx/api');
    if (view?.kind !== 'service') {
      throw new Error('ожидался сервис');
    }
    expect(view.routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /api/users');
    expect(view.routes.find((r) => r.path === '/api/users')?.doc).toBe('Список пользователей с постами.');
    expect(view.tables.map((t) => t.exportName).sort()).toEqual(['posts', 'users']);
    expect(view.symbols.some((s) => s.name === 'findUserById')).toBe(true);
  });

  test('сервис без роутов (db): свои таблицы', async () => {
    const doc = await scannedMap();
    const view = selectNodeCode(doc, 'service:@fx/db');
    expect(view?.kind === 'service' ? view.tables.map((t) => t.exportName).sort() : []).toEqual([
      'Customer',
      'Order',
      'comments',
      'postTags',
      'posts',
      'users',
    ]);
  });

  test('экран без раздела code — null', async () => {
    const doc = await scannedMap();
    const page = doc.nodes.find((n) => n.kind === 'page');
    expect(selectNodeCode({ ...doc, code: undefined }, page?.id ?? '')).toBeNull();
  });
});

/** Карта: экраны apps/web внутри source-monorepo (настоящий скан, экраны вызывают API). */
async function webMap(): Promise<AppMapDocument> {
  const source = path.join(FIXTURES, 'source-monorepo');
  const res = await runScan({ dir: path.join(source, 'apps/web'), codeDir: source });
  return res.document;
}

describe('selectNodeCode: экран → роуты', () => {
  test('экран: сопоставленные вызовы с роутом, сервисом и таблицами; несопоставленные отдельно', async () => {
    const doc = await webMap();
    const page = doc.nodes.find((n) => n.pathPattern === '/users');
    const view = selectNodeCode(doc, page?.id ?? '');
    if (view?.kind !== 'page') {
      throw new Error('ожидался экран');
    }
    expect(
      view.api.map((i) => `${i.call.method} ${i.call.path} → ${i.service?.name} ${i.route?.path} [${i.db.map((g) => `${g.operation} ${g.table}`).join(', ')}] ← ${i.via ?? '-'}`),
    ).toEqual([
      'DELETE /api/admin/users/:id → @fx/api /api/admin/users/:id [delete posts, delete users] ← UserRow',
      'GET /api/users → @fx/api /api/users [select posts, select users] ← useUsers',
    ]);
    expect(view.unmatched.map((i) => `${i.call.method} ${i.call.path}`)).toEqual(['GET /api/unknown-thing']);
  });

  test('сервис: у роута видно, какие экраны его вызывают', async () => {
    const doc = await webMap();
    const view = selectNodeCode(doc, 'service:@fx/api');
    if (view?.kind !== 'service') {
      throw new Error('ожидался сервис');
    }
    const route = view.routes.find((r) => r.method === 'GET' && r.path === '/api/users');
    expect(view.callers.get(route?.id ?? '')?.map((c) => c.title)).toEqual(
      doc.nodes.filter((n) => n.pathPattern === '/users').map((n) => n.title),
    );
  });
});

describe('groupDbCalls', () => {
  test('повторы операции с таблицей сворачиваются в одну строку со счётчиком', async () => {
    const doc = await scannedMap();
    const del = doc.code?.routes.find((r) => r.method === 'DELETE' && r.path === '/api/admin/users/:id');
    expect(groupDbCalls(del?.dbCalls ?? [])).toEqual([
      { operation: 'delete', table: 'posts', count: 1, inLoop: false },
      { operation: 'delete', table: 'users', count: 1, inLoop: false },
    ]);
  });

  test('группа помечена inLoop, если хоть один вызов в цикле', async () => {
    const doc = await scannedMap();
    const batch = doc.code?.routes.find((r) => r.path === '/users/batch');
    expect(groupDbCalls(batch?.dbCalls ?? [])).toEqual([
      { operation: 'select', table: 'posts', count: 1, inLoop: false },
      { operation: 'select', table: 'users', count: 2, inLoop: true },
    ]);
  });
});

describe('matchesCodeFilter', () => {
  test('все слова запроса должны встретиться в полях, регистр не важен', async () => {
    const doc = await scannedMap();
    const routes = doc.code?.routes ?? [];
    const hit = routes.filter((r) => matchesCodeFilter('ПОЛЬЗОВАТЕЛ get', [r.method, r.path, r.doc]));
    expect(hit.map((r) => r.path).sort()).toEqual(['/api/users', '/api/users/:id']);
    expect(routes.filter((r) => matchesCodeFilter('  ', [r.path]))).toHaveLength(routes.length);
  });
});

describe('filterCanvasGraph', () => {
  test('ноды сервисов попадают на холст вместе с экранами', async () => {
    const doc = await scannedMap();
    const { filtered } = filterCanvasGraph(doc, '');
    expect(filtered.some((n) => n.kind === 'service')).toBe(true);
    expect(filtered.some((n) => n.kind === 'page')).toBe(true);
  });
});
