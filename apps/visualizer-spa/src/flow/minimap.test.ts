import { describe, expect, test } from 'bun:test';
import { layoutBounds, MINIMAP_GROUP_COLORS, MINIMAP_MAX, MINIMAP_MIN_SIDE, minimapFill, minimapSize } from './minimap';

describe('minimapSize', () => {
  test('широкая раскладка — во всю ширину, высота по пропорциям', () => {
    expect(minimapSize({ x: 0, y: 0, width: 4800, height: 2000 })).toEqual({ width: MINIMAP_MAX.width, height: Math.round((MINIMAP_MAX.width * 2000) / 4800) });
  });

  test('высокая раскладка korbor-all (4208×30809) — во всю высоту, ширина не уже минимума', () => {
    const s = minimapSize({ x: 0, y: 0, width: 4208, height: 30809 });
    expect(s.height).toBe(MINIMAP_MAX.height);
    expect(s.width).toBe(MINIMAP_MIN_SIDE);
  });

  test('пустая карта — наибольший размер', () => {
    expect(minimapSize(null)).toEqual(MINIMAP_MAX);
  });
});

test('layoutBounds охватывает все ноды', () => {
  expect(layoutBounds([{ x: 10, y: 20, width: 100, height: 50 }, { x: -5, y: 300, width: 20, height: 20 }])).toEqual({ x: -5, y: 20, width: 115, height: 300 });
  expect(layoutBounds([])).toBeNull();
});

describe('minimapFill', () => {
  const order = ['miniapp', 'admin', 'site'];
  test('рамка группы без заливки, экраны разных групп — разного цвета', () => {
    expect(minimapFill({ kind: 'frame' }, order)).toBe('none');
    const a = minimapFill({ kind: 'page', group: 'miniapp', selected: false }, order);
    const b = minimapFill({ kind: 'page', group: 'admin', selected: false }, order);
    expect(a).not.toBe(b);
    expect(MINIMAP_GROUP_COLORS).toContain(a);
  });

  test('выбранный экран выделен', () => {
    expect(minimapFill({ kind: 'page', group: 'miniapp', selected: true }, order)).not.toBe(minimapFill({ kind: 'page', group: 'miniapp', selected: false }, order));
  });
});
