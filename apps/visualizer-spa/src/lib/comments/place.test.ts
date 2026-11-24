/**
 * Место окна замечания и плашки, вырезка снимка: как их увидит пользователь.
 */
import { describe, expect, test } from 'bun:test';
import { barPlace, popoverPlace, shotRect } from './place';

const view = { width: 1600, height: 900 };
const size = { width: 360, height: 300 };
/** Экран 390 CSS px, на холсте в масштабе 0,9. */
const screen = { left: 600, top: 100, width: 351, height: 760 };
const frame = { rect: { x: 20, y: 200, width: 300, height: 60 }, pageWidth: 390 };

describe('окно замечания', () => {
  test('справа от экрана на уровне элемента с учётом масштаба', () => {
    expect(popoverPlace(screen, frame, view, size)).toEqual({ left: 600 + 351 + 16, top: 100 + 200 * 0.9 });
  });

  test('справа не влезает — слева; нигде — у правого края поверх', () => {
    expect(popoverPlace({ ...screen, left: 1200 }, frame, view, size)?.left).toBe(1200 - 16 - 360);
    expect(popoverPlace({ ...screen, left: 100, width: 1300 }, frame, view, size)?.left).toBe(1600 - 12 - 360);
  });

  test('низ вкладки — окно поднимается; экран целиком — у верха экрана', () => {
    expect(popoverPlace(screen, { ...frame, rect: { ...frame.rect, y: 800 } }, view, size)?.top).toBe(900 - 300 - 12);
    expect(popoverPlace(screen, null, view, size)?.top).toBe(100);
  });

  test('элемент ушёл из кадра — окна нет', () => {
    expect(popoverPlace({ ...screen, top: -800 }, frame, view, size)).toBeNull();
    expect(popoverPlace({ ...screen, left: 1700 }, frame, view, size)).toBeNull();
  });
});

describe('плашка и снимок', () => {
  test('плашка по центру под экраном, не ниже вкладки', () => {
    expect(barPlace(screen, view, { width: 600, height: 44 })).toEqual({ left: 600 + 351 / 2 - 300, top: 900 - 44 - 12 });
    expect(barPlace({ ...screen, height: 300 }, view, { width: 600, height: 44 }).top).toBe(100 + 300 + 12);
  });

  test('снимок: элемент с полем 8, обрезан кадром; вне кадра — нет', () => {
    expect(shotRect({ x: 4, y: 830, width: 100, height: 40 }, { width: 390, height: 844 }, 8)).toEqual({ x: 0, y: 822, width: 112, height: 22 });
    expect(shotRect({ x: 400, y: 10, width: 20, height: 20 }, { width: 390, height: 844 }, 0)).toBeNull();
  });
});
