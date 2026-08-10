import { describe, expect, test } from 'bun:test';
import {
  ASPECT_16_9,
  assertShellConsistency,
  clampViewport,
  computeNodeLayout,
  contentDisplaySize,
  DEFAULT_VIEWPORT,
  fitTo16x9,
  NODE_PAD_X,
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

  test('640×360 @ 0.75: content both axes + outer chrome', () => {
    const layout = computeNodeLayout(
      { width: 640, height: 360, label: '16:9' },
      0.75,
    );
    expect(layout.contentWidth).toBe(480);
    expect(layout.contentHeight).toBe(270);
    expect(layout.outerWidth).toBe(480 + NODE_PAD_X);
    expect(layout.outerHeight).toBe(270 + layout.chromeHeight);
    expect(assertShellConsistency(layout)).toBe(true);
    const outer = nodeOuterSize({ width: 640, height: 360 }, 0.75);
    expect(outer.width).toBe(layout.outerWidth);
    expect(outer.height).toBe(layout.outerHeight);
  });

  test('phone 390×844 @ 0.5: non-16:9 shell consistency', () => {
    const layout = computeNodeLayout({ width: 390, height: 844 }, 0.5);
    expect(layout.contentWidth).toBe(195);
    expect(layout.contentHeight).toBe(422);
    expect(assertShellConsistency(layout)).toBe(true);
    expect(layout.outerWidth).toBe(layout.contentWidth + NODE_PAD_X);
  });

  test('selected adds chrome bar height', () => {
    const plain = computeNodeLayout(DEFAULT_VIEWPORT, 0.75, { selected: false });
    const selected = computeNodeLayout(DEFAULT_VIEWPORT, 0.75, {
      selected: true,
    });
    expect(selected.outerHeight).toBeGreaterThan(plain.outerHeight);
    expect(selected.contentWidth).toBe(plain.contentWidth);
    expect(assertShellConsistency(selected)).toBe(true);
  });

  test('contentDisplaySize scales both axes', () => {
    const c = contentDisplaySize({ width: 640, height: 360 }, 0.5);
    expect(c.width).toBe(320);
    expect(c.height).toBe(180);
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
