import { describe, expect, test } from 'bun:test';
import {
  applyMapDeviceViewport,
  assertShellConsistency,
  clampViewport,
  computeNodeLayout,
  contentDisplaySize,
  DEFAULT_VIEWPORT,
  fitTo16x9,
  NODE_PAD_X,
  nodeOuterSize,
  resolveNodeViewport,
  viewportFromPresetId,
} from './viewport';

describe('viewport', () => {
  test('default is 390×844 fixed (JSON path, no measure)', () => {
    expect(DEFAULT_VIEWPORT.width).toBe(390);
    expect(DEFAULT_VIEWPORT.height).toBe(844);
    expect(DEFAULT_VIEWPORT.heightMode).toBe('fixed');
  });

  test('fitTo16x9', () => {
    const v = fitTo16x9(1280);
    expect(v.width).toBe(1280);
    expect(v.height).toBe(720);
  });

  test('clamp keeps sane bounds; tall auto allowed', () => {
    expect(clampViewport({ width: 10, height: 10 }).width).toBe(200);
    expect(clampViewport({ width: 5000, height: 5000 }).width).toBe(2560);
    expect(clampViewport({ width: 390, height: 4000 }).height).toBe(4000);
  });

  test('1920×1080 @ 1: full size on map', () => {
    const layout = computeNodeLayout(
      { width: 1920, height: 1080, label: '1920×1080', heightMode: 'fixed' },
      1,
    );
    expect(layout.contentWidth).toBe(1920);
    expect(layout.contentHeight).toBe(1080);
    expect(layout.outerWidth).toBe(1920 + NODE_PAD_X);
    expect(layout.outerHeight).toBe(1080 + layout.chromeHeight);
    expect(assertShellConsistency(layout)).toBe(true);
    const outer = nodeOuterSize({ width: 1920, height: 1080 }, 1);
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
    const plain = computeNodeLayout(DEFAULT_VIEWPORT, 1, { selected: false });
    const selected = computeNodeLayout(DEFAULT_VIEWPORT, 1, {
      selected: true,
    });
    expect(selected.outerHeight).toBeGreaterThan(plain.outerHeight);
    expect(selected.contentWidth).toBe(plain.contentWidth);
    expect(assertShellConsistency(selected)).toBe(true);
  });

  test('contentDisplaySize scales both axes', () => {
    const c = contentDisplaySize({ width: 1920, height: 1080 }, 0.5);
    expect(c.width).toBe(960);
    expect(c.height).toBe(540);
  });

  test('override wins over node viewport', () => {
    const v = resolveNodeViewport({
      nodeViewport: { width: 320, height: 200 },
      override: { width: 375, height: 667, label: 'Телефон S' },
    });
    expect(v.width).toBe(375);
    expect(v.label).toBe('Телефон S');
  });

  test('default when empty is DEFAULT_VIEWPORT', () => {
    expect(resolveNodeViewport({})).toEqual(DEFAULT_VIEWPORT);
  });

  test('page viewport in JSON wins (fixed)', () => {
    const v = resolveNodeViewport({
      nodeViewport: {
        width: 375,
        height: 667,
        label: 'iPhone',
        heightMode: 'fixed',
      },
      measuredHeight: 9999,
    });
    expect(v.width).toBe(375);
    expect(v.height).toBe(667);
    expect(v.heightMode).toBe('fixed');
  });

  test('map defaultDeviceViewport applied when page has no viewport', () => {
    const v = resolveNodeViewport({
      layout: {
        defaultDeviceViewport: {
          width: 768,
          height: 1024,
          label: 'tablet',
          heightMode: 'fixed',
        },
      },
      measuredHeight: 5000,
    });
    expect(v.width).toBe(768);
    expect(v.height).toBe(1024);
    expect(v.heightMode).toBe('fixed');
  });

  test('fixed ignores measuredHeight (no measure-during-render path)', () => {
    const layout = computeNodeLayout(
      resolveNodeViewport({
        layout: {
          defaultWidth: 390,
          defaultHeight: 844,
          defaultHeightMode: 'fixed',
        },
        measuredHeight: 12_345,
      }),
      0.5,
    );
    expect(layout.viewport.height).toBe(844);
    expect(layout.contentHeight).toBe(422);
    expect(assertShellConsistency(layout)).toBe(true);
  });

  test('auto still uses measuredHeight when explicit', () => {
    const v = resolveNodeViewport({
      nodeViewport: { width: 390, height: 400, heightMode: 'auto' },
      measuredHeight: 1200,
    });
    expect(v.heightMode).toBe('auto');
    expect(v.height).toBe(1200);
  });

  test('applyMapDeviceViewport merges layout fields', () => {
    const next = applyMapDeviceViewport(
      { algorithm: 'row', nodeGap: 48 },
      { width: 480, height: 900, label: '480', heightMode: 'fixed' },
    );
    expect(next.algorithm).toBe('row');
    expect(next.defaultDeviceViewport?.width).toBe(480);
    expect(next.defaultWidth).toBe(480);
    expect(next.defaultHeight).toBe(900);
    expect(next.defaultHeightMode).toBe('fixed');
  });

  test('viewportFromPresetId w1920', () => {
    const v = viewportFromPresetId('w1920', undefined);
    expect(v).not.toBeNull();
    expect(v?.width).toBe(1920);
    expect(v?.height).toBe(1080);
    expect(v?.heightMode).toBe('fixed');
  });
});
