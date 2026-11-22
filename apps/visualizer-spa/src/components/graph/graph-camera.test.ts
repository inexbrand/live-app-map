/**
 * Геометрия холста графа: радиус узла, камера (вписать, центрировать, колесо),
 * попадание курсора в узел, узлы симуляции из графа.
 */
import { describe, expect, test } from 'bun:test';
import type { DocGraph, GraphNodeKind } from '../../lib/doc-graph';
import { centeredCamera, fitCamera, nodeAt, nodeRadius, toSimNodes, toWorld, zoomAt } from './graph-camera';
import type { SimNode } from './graph-draw';

function sim(id: string, x: number | undefined, y: number | undefined, r = 5): SimNode {
  return { id, kind: 'file', label: id, notReady: false, r, x, y };
}

describe('nodeRadius', () => {
  test('база по типу плюс корень из числа связей ×1.2, прибавка не больше 8', () => {
    const kinds: GraphNodeKind[] = ['epoch', 'note', 'guide', 'epoch-file', 'file', 'route', 'table', 'screen', 'service'];
    expect(kinds.map((k) => nodeRadius(k, 0))).toEqual([7, 6, 6, 3.5, 3.5, 4.5, 4.5, 4.5, 4.5]);
    expect(nodeRadius('route', 4)).toBeCloseTo(4.5 + 2.4);
    expect(nodeRadius('epoch', 100)).toBe(15);
  });
});

describe('fitCamera', () => {
  test('без размещённых узлов — центр холста, масштаб 1', () => {
    expect(fitCamera([sim('a', undefined, undefined)], 300, 200, 20)).toEqual({ x: 150, y: 100, k: 1 });
  });

  test('рамка узлов вписывается с полями, центр рамки — в центр холста', () => {
    expect(fitCamera([sim('a', 0, 0), sim('b', 100, 50)], 300, 200, 50)).toEqual({ k: 2, x: 50, y: 50 });
    // Рамка считается от минимума до максимума, в том числе отрицательных координат.
    expect(fitCamera([sim('a', -50, 0), sim('b', 50, 10)], 300, 200, 50).k).toBe(2);
    expect(fitCamera([sim('a', 0, -50), sim('b', 10, 50)], 300, 200, 50).k).toBe(1);
    // По ширине теснее: масштаб — по ширине.
    expect(fitCamera([sim('a', 0, 0), sim('b', 100, 10)], 300, 200, 50).k).toBe(2);
    // По высоте теснее, чем по ширине: масштаб — по высоте.
    expect(fitCamera([sim('a', 0, 0), sim('b', 100, 100)], 400, 200, 50)).toEqual({ k: 1, x: 150, y: 50 });
  });

  test('масштаб в пределах 0.15…3', () => {
    expect(fitCamera([sim('a', 10, 20)], 300, 200, 10).k).toBe(3);
    expect(fitCamera([sim('a', 0, 0), sim('b', 100000, 0)], 300, 200, 10).k).toBe(0.15);
  });
});

describe('centeredCamera и toWorld', () => {
  const cam = { x: 5, y: 7, k: 2 };

  test('узел ставится в центр при том же масштабе', () => {
    const c = centeredCamera(sim('a', 10, 20), cam, { w: 300, h: 200 });
    expect(c).toEqual({ k: 2, x: 130, y: 60 });
    expect(toWorld(c, { x: 150, y: 100 })).toEqual({ x: 10, y: 20 });
  });

  test('нет узла или координат — камера не меняется', () => {
    expect(centeredCamera(undefined, cam, { w: 300, h: 200 })).toBe(cam);
    expect(centeredCamera(sim('a', 10, undefined), cam, { w: 300, h: 200 })).toBe(cam);
    expect(centeredCamera(sim('a', undefined, 10), cam, { w: 300, h: 200 })).toBe(cam);
  });
});

describe('nodeAt', () => {
  const nodes = [sim('a', 0, 0), sim('b', 8, 0), sim('far', 100, 100), sim('lost', undefined, undefined)];

  test('ближайший узел в пределах радиуса + 6', () => {
    const cam = { x: 0, y: 0, k: 1 };
    expect(nodeAt(nodes, cam, { x: 1, y: 0 })?.id).toBe('a');
    expect(nodeAt(nodes, cam, { x: 6, y: 0 })?.id).toBe('b');
    // Ровно посередине — первый из равноудалённых.
    expect(nodeAt(nodes, cam, { x: 4, y: 0 })?.id).toBe('a');
    expect(nodeAt(nodes, cam, { x: 100, y: 110.9 })?.id).toBe('far');
    expect(nodeAt(nodes, cam, { x: 100, y: 111 })).toBeNull();
    expect(nodeAt(nodes, cam, { x: 50, y: 50 })).toBeNull();
  });

  test('точка экрана переводится камерой; мелкий масштаб расширяет зону, крупный — не сужает', () => {
    expect(nodeAt(nodes, { x: 10, y: 20, k: 2 }, { x: 210, y: 221 })?.id).toBe('far');
    expect(nodeAt(nodes, { x: 0, y: 0, k: 0.5 }, { x: 50, y: 50 + 21 / 2 })?.id).toBe('far');
    expect(nodeAt(nodes, { x: 0, y: 0, k: 0.5 }, { x: 50, y: 50 + 23 / 2 })).toBeNull();
    expect(nodeAt(nodes, { x: 0, y: 0, k: 2 }, { x: 200, y: 200 + 2 * 10.5 })?.id).toBe('far');
  });
});

describe('zoomAt', () => {
  const cam = { x: 30, y: -10, k: 2 };
  const p = { x: 100, y: 80 };

  test('колесо вверх увеличивает, вниз уменьшает; точка под курсором остаётся на месте', () => {
    for (const deltaY of [-200, 200]) {
      const next = zoomAt(cam, p, deltaY);
      expect(next.k).toBeCloseTo(2 * Math.exp(-deltaY * 0.0015));
      const before = toWorld(cam, p);
      const after = toWorld(next, p);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    }
  });

  test('масштаб в пределах 0.15…3', () => {
    expect(zoomAt(cam, p, -100000).k).toBe(3);
    expect(zoomAt(cam, p, 100000).k).toBe(0.15);
  });
});

describe('toSimNodes', () => {
  const graph: DocGraph = {
    nodes: [
      { id: 'e', kind: 'epoch', label: 'Эпоха', detail: '', readiness: 'not-ready' },
      { id: 'f', kind: 'epoch-file', label: 'Файл', detail: '', readiness: 'ready' },
      { id: 'n', kind: 'note', label: 'Заметка', detail: '' },
      { id: 'alone', kind: 'route', label: 'Один', detail: '' },
    ],
    edges: [
      { source: 'e', target: 'f', kind: 'contains' },
      { source: 'e', target: 'n', kind: 'links' },
      { source: 'n', target: 'f', kind: 'links' },
      { source: 'e', target: 'n', kind: 'links' },
    ],
  };

  test('радиус от числа рёбер с обеих сторон, неготовая эпоха помечена, прежние позиции сохраняются', () => {
    expect(toSimNodes(graph, new Map([['f', { x: 3, y: 4 }]]))).toEqual([
      { id: 'e', kind: 'epoch', label: 'Эпоха', notReady: true, r: nodeRadius('epoch', 3) },
      { id: 'f', kind: 'epoch-file', label: 'Файл', notReady: false, r: nodeRadius('epoch-file', 2), x: 3, y: 4 },
      { id: 'n', kind: 'note', label: 'Заметка', notReady: false, r: nodeRadius('note', 3) },
      { id: 'alone', kind: 'route', label: 'Один', notReady: false, r: 4.5 },
    ]);
  });
});
