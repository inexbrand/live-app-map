/**
 * Скрипт страницы шлюза в DOM (happy-dom): колесо из визуализатора прокручивает
 * ближайший прокручиваемый контейнер под курсором, иначе документ; сообщение о
 * высоте страницы распознаётся визуализатором.
 */
import { useDom } from '../../test/dom';
// Testing Library ставит свои хуки при загрузке: грузится здесь, а не из afterEach useDom
import '@testing-library/react';
import { beforeEach, describe, expect, test } from 'bun:test';
import { injectScript, isLamPageMessage, wheelScroll } from './inject-script';

useDom();

type Box = { el: HTMLElement; moves: Array<[number, number]> };

/** Контейнер с размерами прокрутки; scrollBy двигает позицию и пишет сдвиг. */
function box(overflow: string, size: { w: number; h: number; vw: number; vh: number }, parent: HTMLElement = document.body): Box {
  const el = document.createElement('div');
  el.style.overflowX = overflow;
  el.style.overflowY = overflow;
  let top = 0;
  let left = 0;
  const moves: Array<[number, number]> = [];
  Object.defineProperties(el, {
    scrollWidth: { get: () => size.w },
    scrollHeight: { get: () => size.h },
    clientWidth: { get: () => size.vw },
    clientHeight: { get: () => size.vh },
    scrollTop: { get: () => top, set: (v: number) => (top = v) },
    scrollLeft: { get: () => left, set: (v: number) => (left = v) },
  });
  el.scrollBy = ((x: number, y: number) => {
    moves.push([x, y]);
    left += x;
    top += y;
  }) as typeof el.scrollBy;
  parent.append(el);
  return { el, moves };
}

function pointAt(el: Element | null): void {
  Reflect.set(document, 'elementFromPoint', () => el);
}

/** Документ: прокручивается на сдвиг, пока не упрётся в край. */
function rootScroll(max: number): Array<[number, number]> {
  const moves: Array<[number, number]> = [];
  let top = 0;
  const root = document.createElement('div');
  Object.defineProperties(root, { scrollTop: { get: () => top }, scrollLeft: { get: () => 0 } });
  root.scrollBy = ((x: number, y: number) => {
    moves.push([x, y]);
    top = Math.min(max, Math.max(0, top + y));
  }) as typeof root.scrollBy;
  Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => root });
  return moves;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('колесо в странице', () => {
  test('ближайший контейнер, который может прокрутиться в эту сторону', () => {
    const outer = box('auto', { w: 100, h: 1000, vw: 100, vh: 300 });
    const inner = box('hidden', { w: 100, h: 900, vw: 100, vh: 100 }, outer.el);
    pointAt(inner.el);
    expect(wheelScroll(10, 10, 0, 120)).toBe(true);
    expect(inner.moves).toEqual([]);
    expect(outer.moves).toEqual([[0, 120]]);
    // Вверх с самого верха — некуда: дальше к документу
    outer.el.scrollTop = 0;
    const doc = rootScroll(500);
    expect(wheelScroll(10, 10, 0, -50)).toBe(false);
    expect(doc).toEqual([[0, -50]]);
  });

  test('вбок: контейнер с горизонтальной прокруткой; у края — документ', () => {
    const strip = box('scroll', { w: 800, h: 100, vw: 200, vh: 100 });
    pointAt(strip.el);
    expect(wheelScroll(0, 0, 90, 0)).toBe(true);
    expect(strip.moves).toEqual([[90, 0]]);
    strip.el.scrollLeft = 600;
    const doc = rootScroll(400);
    expect(wheelScroll(0, 0, 90, 0)).toBe(false);
    expect(wheelScroll(0, 0, 0, 100)).toBe(true);
    expect(doc).toEqual([[90, 0], [0, 100]]);
  });

  test('нет документа для прокрутки — false', () => {
    pointAt(null);
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => null });
    expect(wheelScroll(0, 0, 0, 10)).toBe(false);
  });

  test('встроенный скрипт: сообщение wheel от визуализатора прокручивает контейнер', () => {
    const list = box('auto', { w: 100, h: 2000, vw: 100, vh: 400 });
    pointAt(list.el);
    const body = /<script data-lam-gateway>([\s\S]*)<\/script>$/.exec(injectScript({}, 'recruiter', true))?.[1] ?? '';
    new Function(body)();
    window.dispatchEvent(new MessageEvent('message', { data: { lam: 'wheel', x: 5, y: 5, dx: 0, dy: 240 }, source: window }));
    expect(list.moves).toEqual([[0, 240]]);
  });
});

describe('isLamPageMessage', () => {
  test('высота страницы — числа; прочее — нет', () => {
    expect(isLamPageMessage({ lam: 'page', contentHeight: 900, viewportHeight: 700 })).toBe(true);
    expect(isLamPageMessage({ lam: 'page', contentHeight: '900', viewportHeight: 700 })).toBe(false);
    expect(isLamPageMessage({ lam: 'page', contentHeight: 900 })).toBe(false);
    expect(isLamPageMessage({ lam: 'ping' })).toBe(false);
    expect(isLamPageMessage(null)).toBe(false);
    expect(isLamPageMessage('page')).toBe(false);
  });
});
