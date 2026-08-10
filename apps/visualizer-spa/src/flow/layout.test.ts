import { describe, expect, test } from 'bun:test';
import type { AppMapEdge, AppMapNode } from '@live-app-map/schema';
import { layoutNodes, type Positioned } from './layout';

/**
 * Минимальный page-узел для unit-тестов раскладки.
 */
function pageNode(
  id: string,
  path: string,
  position?: { readonly x: number; readonly y: number },
): AppMapNode {
  return {
    id,
    kind: 'page',
    title: id,
    pathPattern: path,
    ...(position !== undefined ? { position } : {}),
  };
}

/**
 * Навигационное ребро between from → to.
 */
function linkEdge(id: string, from: string, to: string): AppMapEdge {
  return {
    id,
    from,
    to,
    kind: 'link',
    confidence: 'high',
  };
}

/**
 * Стабильный snapshot позиций: id → x/y (сортировка по id для сравнения).
 */
function snapshot(positions: Map<string, Positioned>): ReadonlyArray<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
}> {
  return [...positions.values()]
    .map((p) => ({ id: p.id, x: p.x, y: p.y }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('layoutNodes', () => {
  test('пустые nodes → пустая Map (size 0, entries = [])', () => {
    const result = layoutNodes([], [], 'LR');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect([...result.entries()]).toEqual([]);
    expect([...result.values()]).toEqual([]);
  });

  test('пустые nodes + edges → всё равно пусто (edges не создают узлов)', () => {
    const edges = [linkEdge('e1', 'a', 'b')];
    const result = layoutNodes([], edges, 'LR');

    expect(result.size).toBe(0);
    expect([...result.values()]).toEqual([]);
  });

  test('одинаковый input → стабильные x/y (два прогона, LR)', () => {
    const nodes: readonly AppMapNode[] = [
      pageNode('home', '/'),
      pageNode('list', '/items'),
      pageNode('detail', '/items/:id'),
    ];
    const edges: readonly AppMapEdge[] = [
      linkEdge('e1', 'home', 'list'),
      linkEdge('e2', 'list', 'detail'),
    ];

    const first = layoutNodes(nodes, edges, 'LR');
    const second = layoutNodes(nodes, edges, 'LR');

    expect(snapshot(first)).toEqual(snapshot(second));
    expect(first.size).toBe(3);
    for (const id of ['home', 'list', 'detail']) {
      const a = first.get(id);
      const b = second.get(id);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a === undefined || b === undefined) {
        throw new Error(`missing position for ${id}`);
      }
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }
  });

  test('одинаковый input → стабильный порядок id и x/y (TB)', () => {
    const nodes: readonly AppMapNode[] = [
      pageNode('a', '/a'),
      pageNode('b', '/b'),
      pageNode('c', '/c'),
    ];
    const edges: readonly AppMapEdge[] = [
      linkEdge('ab', 'a', 'b'),
      linkEdge('bc', 'b', 'c'),
    ];

    const run1 = [...layoutNodes(nodes, edges, 'TB').values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
    }));
    const run2 = [...layoutNodes(nodes, edges, 'TB').values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
    }));

    expect(run1).toEqual(run2);
    expect(run1.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('все nodes с position → сохраняются без dagre-сдвига', () => {
    const nodes: readonly AppMapNode[] = [
      pageNode('pinned-a', '/a', { x: 10, y: 20 }),
      pageNode('pinned-b', '/b', { x: 100, y: 200 }),
    ];

    const result = layoutNodes(nodes, [], 'LR');

    expect(result.get('pinned-a')).toEqual({ id: 'pinned-a', x: 10, y: 20 });
    expect(result.get('pinned-b')).toEqual({ id: 'pinned-b', x: 100, y: 200 });
  });

  test('частичные position: pinned сохраняется, остальные — finite dagre', () => {
    const nodes: readonly AppMapNode[] = [
      pageNode('fixed', '/fixed', { x: 50, y: 60 }),
      pageNode('free', '/free'),
    ];
    const edges: readonly AppMapEdge[] = [linkEdge('e', 'fixed', 'free')];

    const result = layoutNodes(nodes, edges, 'LR');

    expect(result.get('fixed')).toEqual({ id: 'fixed', x: 50, y: 60 });
    const free = result.get('free');
    expect(free).toBeDefined();
    if (free === undefined) {
      throw new Error('free node missing');
    }
    expect(Number.isFinite(free.x)).toBe(true);
    expect(Number.isFinite(free.y)).toBe(true);
  });
});
