import { describe, expect, test } from 'bun:test';
import {
  ASPECT_16_9,
  clampViewport,
  contentDisplaySize,
  DEFAULT_VIEWPORT,
  fitTo16x9,
  nodeOuterSize,
  resolveNodeViewport,
} from './viewport';

describe('viewport', () => {
  test('default is 16:9', () => {
    expect(DEFAULT_VIEWPORT.width / DEFAULT_VIEWPORT.height).toBeCloseTo(
      ASPECT_16_9,
      2,
    );
    expect(DEFAULT_VIEWPORT.width).toBe(640);
    expect(DEFAULT_VIEWPORT.height).toBe(360);
  });

  test('fitTo16x9', () => {
    const v = fitTo16x9(1280);
    expect(v.width).toBe(1280);
    expect(v.height).toBe(720);
  });

  test('clamp keeps sane bounds', () => {
    expect(clampViewport({ width: 10, height: 10 }).width).toBe(200);
    expect(clampViewport({ width: 5000, height: 5000 }).width).toBe(1920);
  });

  test('contentDisplaySize scales both axes', () => {
    const c = contentDisplaySize({ width: 640, height: 360 }, 0.5);
    expect(c.width).toBe(320);
    expect(c.height).toBe(180);
  });

  test('outer size includes chrome', () => {
    const o = nodeOuterSize({ width: 640, height: 360 }, 0.5);
    expect(o.width).toBe(320 + 16);
    expect(o.height).toBeGreaterThan(180);
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
