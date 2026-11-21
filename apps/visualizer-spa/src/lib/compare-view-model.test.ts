/**
 * Модель вида «Сравнение» на настоящей карте korbor-all и её изменённой копии.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppMapDocument } from '@live-app-map/schema';
import { compareMaps } from './compare-view-model';
import { documentFromJson } from './import-map';

const raw: unknown = JSON.parse(readFileSync(path.join(import.meta.dir, '../../public/maps/korbor-all.liveappmap.json'), 'utf8'));
const parsed = documentFromJson(raw);
if (!parsed.ok) {
  throw new Error(parsed.error);
}
const left: AppMapDocument = parsed.document;
const code = left.code;
if (code === undefined) {
  throw new Error('в korbor-all нет раздела code');
}
const page = left.nodes.find((n) => n.kind === 'page');
const goneRoute = code.routes[0];
const table = code.tables[0];
const edge = left.edges[0];
if (page === undefined || goneRoute === undefined || table === undefined || edge === undefined) {
  throw new Error('карта korbor-all неполная');
}
/** «Стало»: экран переименован, роут удалён, в таблицу добавлена колонка, связь пропала. */
const right: AppMapDocument = {
  ...left,
  nodes: left.nodes.map((n) => (n.id === page.id ? { ...n, title: 'Новое имя' } : n)),
  edges: left.edges.slice(1),
  code: {
    ...code,
    routes: code.routes.slice(1),
    tables: code.tables.map((t) => (t.id === table.id ? { ...t, columns: [...t.columns, { name: 'archivedAt', type: 'timestamp' }] } : t)),
  },
};

describe('compareMaps', () => {
  const c = compareMaps(left, right);
  const section = (key: string) => c.sections.find((s) => s.key === key);

  test('одинаковые версии — ноль изменений и пустые разделы', () => {
    const same = compareMaps(left, left);
    expect(same.total).toBe(0);
    expect(same.sections.every((s) => s.items.length === 0)).toBe(true);
  });

  test('экран: изменено название, подпись — новое имя и путь', () => {
    expect(section('screens')?.items).toEqual([
      { id: page.id, change: 'changed', label: `Новое имя · ${page.pathPattern}`, detail: 'название', target: { kind: 'screen', nodeId: page.id } },
    ]);
  });

  test('роут пропал: метод и путь, без перехода (его нет в «стало»)', () => {
    expect(section('routes')?.items).toEqual([{ id: goneRoute.id, change: 'removed', label: `${goneRoute.method} ${goneRoute.path}` }]);
  });

  test('таблица: добавлена колонка', () => {
    const item = section('tables')?.items[0];
    expect(item?.change).toBe('changed');
    expect(item?.detail).toBe('+archivedAt');
    expect(item?.target).toEqual({ kind: 'table', table: table.exportName });
  });

  test('связь пропала: «откуда → куда» по названиям экранов', () => {
    const from = left.nodes.find((n) => n.id === edge.from)?.title;
    const to = left.nodes.find((n) => n.id === edge.to)?.title;
    expect(section('edges')?.items).toEqual([{ id: edge.id, change: 'removed', label: `${from} → ${to}`, detail: edge.kind }]);
    expect(c.total).toBe(4);
  });
});
