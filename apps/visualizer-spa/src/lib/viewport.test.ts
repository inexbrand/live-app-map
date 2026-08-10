import { describe, expect, test } from 'bun:test';
import {
  clampViewport,
  DEFAULT_VIEWPORT,
  nodeOuterSize,
  resolveNodeViewport,
} from './viewport';

describe('viewport', () => {
  test('clamp keeps sane bounds', () => {
    expect(clampViewport({ width: 10, height: 10 }).width).toBe(200);
    expect(clampViewport({ width: 5000, height: 5000 }).width).toBe(1920);
  });

  test('outer size includes chrome', () => {
    const o = nodeOuterSize({ width: 390, height: 844 }, 0.5);
    expect(o.width).toBeGreaterThan(390 * 0.5);
    expect(o.height).toBeGreaterThan(844 * 0.5);
  });

  test('override wins over node viewport', () => {
    const v = resolveNodeViewport(
      { width: 320, height: 200 },
      { width: 375, height: 667, label: 'Телефон S' },
    );
    expect(v.width).toBe(375);
    expect(v.label).toBe('Телефон S');
  });

  test('default when empty', () => {
    expect(resolveNodeViewport(undefined, undefined)).toEqual(DEFAULT_VIEWPORT);
  });
});
