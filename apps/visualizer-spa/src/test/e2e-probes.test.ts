/**
 * Замеры раскладки e2e (e2e/probes.ts): функции «в браузере» — на happy-dom с заданными
 * прямоугольниками, расчёты — на числах.
 */
import { useDom } from './dom';
import '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  blurActive,
  drawerEdges,
  inside,
  intersects,
  isClickable,
  mcpResult,
  scrollTopOf,
  firstClickable,
  firstNodeInView,
  freeBand,
  layoutItems,
  matrixOf,
  minimapRaw,
  probeOf,
  viewBoxOf,
} from '../../e2e/probes';

useDom();

afterEach(() => {
  document.body.innerHTML = '';
});

/** Элемент с заданным прямоугольником на экране. */
function placed(parent: Element, cls: string, x: number, y: number, w: number, h: number): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => new DOMRect(x, y, w, h) });
  parent.append(el);
  return el;
}

describe('layoutItems + probeOf', () => {
  test('наложения несвязанных панелей, вложенные — не наложение, перекрытые сверху, нулевые — не видны', () => {
    const toolbar = placed(document.body, 'toolbar', 0, 0, 1000, 50);
    placed(toolbar, 'drawer', 900, 0, 100, 40);
    const fab = placed(document.body, 'diag-fab', 950, 30, 40, 40);
    placed(document.body, 'drawer', 0, 0, 0, 0);
    const cover = placed(document.body, 'cover', 0, 0, 10, 10);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) => (x === 970 && y === 50 ? cover : x === 500 ? toolbar : fab),
    });
    const items = layoutItems(['.toolbar', '.drawer', '.diag-fab']);
    expect(probeOf(items)).toEqual({
      shown: ['.toolbar[0]', '.drawer[0]', '.diag-fab[0]'],
      overlaps: ['.toolbar[0] × .diag-fab[0]', '.drawer[0] × .diag-fab[0]'],
      covered: ['.drawer[0]', '.diag-fab[0]'],
    });
  });

  test('касание краями (до 1 px) — не наложение', () => {
    const a = { name: 'a', left: 0, top: 0, right: 100, bottom: 100, related: [0], covered: false };
    const b = { name: 'b', left: 99, top: 0, right: 200, bottom: 100, related: [1], covered: false };
    expect(probeOf([a, b]).overlaps).toEqual([]);
    expect(probeOf([a, { ...b, left: 98 }]).overlaps).toEqual(['a × b']);
  });
});

describe('minimapRaw', () => {
  test('прямоугольники, viewBox, transform вьюпорта, ноды и рамки', () => {
    const flow = placed(document.body, 'react-flow', 0, 0, 1600, 900);
    const vp = placed(flow, 'react-flow__viewport', 0, 0, 10, 10);
    vp.style.transform = 'matrix(0.5, 0, 0, 0.5, 10, 20)';
    const box = placed(document.body, 'react-flow__minimap', 1300, 700, 200, 150);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-10 -20 400 300');
    Object.defineProperty(svg, 'getBoundingClientRect', { value: () => new DOMRect(1300, 700, 200, 150) });
    box.append(svg);
    for (const [cls, fill] of [['react-flow__minimap-node', 'red'], ['react-flow__minimap-node lam-minimap-frame', 'blue']]) {
      const n = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      n.setAttribute('class', cls ?? '');
      n.setAttribute('style', `fill: ${fill}`);
      Object.defineProperty(n, 'getBoundingClientRect', { value: () => new DOMRect(1310, 710, 20, 10) });
      svg.append(n);
    }
    const raw = minimapRaw();
    expect([raw.box, raw.svg, raw.flow]).toEqual([
      { x: 1300, y: 700, w: 200, h: 150 },
      { x: 1300, y: 700, w: 200, h: 150 },
      { x: 0, y: 0, w: 1600, h: 900 },
    ]);
    expect(viewBoxOf(raw.viewBox)).toEqual({ x: -10, y: -20, w: 400, h: 300 });
    expect(matrixOf(raw.transform)).toEqual({ zoom: 0.5, tx: 10, ty: 20 });
    expect(raw.nodes.map((n) => [n.frame, n.fill])).toEqual([
      [false, 'red'],
      [true, 'blue'],
    ]);
  });

  test('нет мини-карты — ошибка', () => {
    expect(() => minimapRaw()).toThrow('нет мини-карты или холста');
  });

  test('matrixOf и viewBoxOf: none и пустой viewBox', () => {
    expect(matrixOf('none')).toEqual({ zoom: 1, tx: 0, ty: 0 });
    expect(viewBoxOf('')).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('выбор ноды и компонента', () => {
  test('firstNodeInView: первая нода целиком под шапкой, точка в её шапке', () => {
    const above = placed(document.body, 'n', 10, 20, 200, 100);
    const ok = placed(document.body, 'n', 30, 100, 30, 100);
    ok.setAttribute('data-id', 'route:/feed');
    expect(firstNodeInView([above, ok])).toEqual({ x: 45, y: 112, id: 'route:/feed' });
    expect(firstNodeInView([above])).toBeNull();
    expect(firstNodeInView([placed(document.body, 'n', 30, 100, 30, 100)])?.id).toBe('');
  });

  test('drawerEdges, freeBand и firstClickable: компонент в полосе между панелями', () => {
    const edges = drawerEdges([placed(document.body, 'drawer', 0, 0, 300, 900), placed(document.body, 'drawer', 1300, 0, 300, 900)]);
    expect(edges).toEqual([
      { left: 0, right: 300 },
      { left: 1300, right: 1600 },
    ]);
    const band = freeBand(edges, 1600);
    expect(band).toEqual({ left: 300, right: 1300 });
    expect(freeBand([], 1280)).toEqual({ left: 0, right: 1280 });
    const under = { x: 100, y: 200, width: 100, height: 40 };
    const small = { x: 400, y: 200, width: 10, height: 40 };
    const good = { x: 400, y: 200, width: 100, height: 40 };
    expect(firstClickable([null, under, small, good], band, 900)).toEqual({ x: 450, y: 212 });
    expect(firstClickable([under, { ...good, y: 50 }, { ...good, y: 880 }], band, 900)).toBeUndefined();
  });
});

describe('границы', () => {
  test('layoutItems: элемент без ширины или высоты не виден; точка проверки — центр по X, не ниже 20 px от верха', () => {
    placed(document.body, 'p', 0, 0, 0, 10);
    placed(document.body, 'p', 0, 0, 10, 0);
    placed(document.body, 'p', 100, 50, 200, 100);
    placed(document.body, 'p', 400, 50, 1, 10);
    placed(document.body, 'p', 500, 50, 10, 1);
    const points: [number, number][] = [];
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) => {
        points.push([x, y]);
        return null;
      },
    });
    expect(layoutItems(['.p']).map((i) => i.name)).toEqual(['.p[2]', '.p[3]', '.p[4]']);
    expect(points).toEqual([
      [200, 70],
      [400.5, 55],
      [505, 50.5],
    ]);
  });

  test('intersects: по каждой стороне перекрытие ровно 1 px — нет, больше — да', () => {
    const a = { name: 'a', left: 0, top: 0, right: 100, bottom: 100, related: [], covered: false };
    const shifted = [
      { left: 99, top: 0, right: 200, bottom: 100 },
      { left: -100, top: 0, right: 1, bottom: 100 },
      { left: 0, top: 99, right: 100, bottom: 200 },
      { left: 0, top: -100, right: 100, bottom: 1 },
    ];
    for (const s of shifted) {
      expect(intersects(a, { ...a, ...s })).toBe(false);
    }
    const deeper = [
      { left: 98.5, top: 0, right: 200, bottom: 100 },
      { left: -100, top: 0, right: 1.5, bottom: 100 },
      { left: 0, top: 98.5, right: 100, bottom: 200 },
      { left: 0, top: -100, right: 100, bottom: 1.5 },
    ];
    for (const s of deeper) {
      expect(intersects(a, { ...a, ...s })).toBe(true);
    }
  });

  test('minimapRaw: нет любой из частей — ошибка; нет viewBox — пустая строка', () => {
    const parts = () => {
      document.body.innerHTML = '';
      const flow = placed(document.body, 'react-flow', 0, 0, 10, 10);
      const vp = placed(flow, 'react-flow__viewport', 0, 0, 1, 1);
      const box = placed(document.body, 'react-flow__minimap', 0, 0, 10, 10);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      box.append(svg);
      return { flow, vp, box, svg };
    };
    for (const drop of ['flow', 'vp', 'box', 'svg'] as const) {
      const p = parts();
      if (drop === 'flow') {
        p.flow.className = 'other';
      } else {
        p[drop].remove();
      }
      expect(() => minimapRaw()).toThrow('нет мини-карты или холста');
    }
    parts();
    expect(minimapRaw().viewBox).toBe('');
  });

  test('matrixOf: нулевой зум не подменяется; viewBoxOf: недостающие числа — 0', () => {
    expect(matrixOf('matrix(0, 0, 0, 0, 3, 4)')).toEqual({ zoom: 0, tx: 3, ty: 4 });
    expect(viewBoxOf('5')).toEqual({ x: 5, y: 0, w: 0, h: 0 });
  });

  test('firstNodeInView: края окна и шапки', () => {
    const at = (x: number, y: number, w: number) => placed(document.body, 'n', x, y, w, 10);
    expect(firstNodeInView([at(0, 70, 10)])).toEqual({ x: 5, y: 82, id: '' });
    expect(firstNodeInView([at(-1, 70, 10)])).toBeNull();
    expect(firstNodeInView([at(0, 69, 10)])).toBeNull();
    expect(firstNodeInView([at(window.innerWidth - 10, 100, 10)])).toBeNull();
    expect(firstNodeInView([at(window.innerWidth - 11, 100, 10)])).not.toBeNull();
    expect(firstNodeInView([at(0, window.innerHeight - 20, 10)])).toBeNull();
    expect(firstNodeInView([at(0, window.innerHeight - 21, 10)])).not.toBeNull();
  });

  test('freeBand: панель ровно посередине не сужает полосу', () => {
    expect(freeBand([{ left: 800, right: 900 }], 1600)).toEqual({ left: 0, right: 1600 });
  });

  test('inside: допуск 1 px по умолчанию на каждой стороне', () => {
    const outer = { x: 10, y: 10, w: 100, h: 100 };
    expect(inside({ x: 9, y: 9, w: 102, h: 102 }, outer)).toBe(true);
    for (const r of [
      { x: 8.5, y: 10, w: 10, h: 10 },
      { x: 10, y: 8.5, w: 10, h: 10 },
      { x: 10, y: 10, w: 101.5, h: 10 },
      { x: 10, y: 10, w: 10, h: 101.5 },
    ]) {
      expect(inside(r, outer)).toBe(false);
    }
    expect(inside({ x: 9, y: 10, w: 10, h: 10 }, outer, 0)).toBe(false);
  });

  test('scrollTopOf: прокрутка 0 и 5, нет элемента — -1; blurActive снимает фокус', () => {
    const box = document.createElement('div');
    box.className = 'scroller';
    document.body.append(box);
    expect(scrollTopOf('.scroller')).toBe(0);
    box.scrollTop = 5;
    expect(scrollTopOf('.scroller')).toBe(5);
    expect(scrollTopOf('.none')).toBe(-1);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    blurActive();
    expect(document.activeElement).toBe(document.body);
    blurActive();
    expect(document.activeElement).toBe(document.body);
  });

  test('mcpResult: JSON первого блока; блоков нет — пустой объект', () => {
    expect(mcpResult({ result: { content: [{ text: '{"a":1}' }, { text: '{"b":2}' }] } })).toEqual({ a: 1 });
    expect(mcpResult({ result: { content: [] } })).toEqual({});
  });

  test('isClickable: пороги размера, шапки, полосы и окна; точка — не ниже 12 px и середина высоты', () => {
    const band = { left: 100, right: 500 };
    const ok = { x: 101, y: 81, width: 21, height: 11 };
    expect(isClickable(ok, band, 900)).toBe(true);
    for (const b of [
      { ...ok, width: 20 },
      { ...ok, height: 10 },
      { ...ok, x: 100 },
      { ...ok, y: 80 },
      { ...ok, x: 479 },
      { ...ok, y: 889 },
    ]) {
      expect(isClickable(b, band, 900)).toBe(false);
    }
    expect(isClickable({ ...ok, x: 478 }, band, 900)).toBe(true);
    expect(isClickable({ ...ok, y: 888 }, band, 900)).toBe(true);
    expect(firstClickable([{ x: 200, y: 200, width: 40, height: 20 }], band, 900)).toEqual({ x: 220, y: 210 });
  });
});
