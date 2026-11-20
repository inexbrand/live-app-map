/**
 * Выбор кода для панели ноды: сервис → роуты/таблицы, экран → символы его файла.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { runScan } from '@live-app-map/cli';
import type { AppMapDocument } from '@live-app-map/schema';
import { filterCanvasGraph } from '../flow/canvas-graph';
import { matchesCodeFilter } from './code-filter';
import { codeFileOfNode, groupDbCalls, selectNodeCode } from './node-code';

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
      'Order',
      'comments',
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

describe('codeFileOfNode', () => {
  test('файл экрана переводится в путь от корня скана исходников', () => {
    expect(codeFileOfNode('/repo/apps/web', '/repo', 'src/App.tsx')).toBe('apps/web/src/App.tsx');
    expect(codeFileOfNode('/repo', '/repo', 'src/App.tsx')).toBe('src/App.tsx');
    expect(codeFileOfNode('/other', '/repo', 'src/App.tsx')).toBeNull();
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
