import { describe, expect, test } from 'bun:test';
import {
  connectorWorldSize,
  DEFAULT_VIEWPORT,
  DEFAULT_WIDTH,
  isConnectorNode,
  resolveDefaultWidth,
  resolveNodeViewport,
  resolveViewportPresets,
} from './viewport';
import type { AppMapNode } from '@live-app-map/schema';

describe('resolveNodeViewport (JSON fixed + optional auto)', () => {
  test('дефолт — width 390, fixed (без measure)', () => {
    const v = resolveNodeViewport({
      nodeViewport: undefined,
      override: undefined,
      layout: undefined,
      measuredHeight: 9999,
    });
    expect(v.width).toBe(DEFAULT_WIDTH);
    expect(v.heightMode).toBe('fixed');
    expect(v.height).toBe(DEFAULT_VIEWPORT.height);
  });

  test('width из layout.defaultWidth, height из measure только при auto', () => {
    const v = resolveNodeViewport({
      nodeViewport: undefined,
      override: undefined,
      layout: { defaultWidth: 480, defaultHeightMode: 'auto' },
      measuredHeight: 2400,
    });
    expect(v.width).toBe(480);
    expect(v.height).toBe(2400);
    expect(v.heightMode).toBe('auto');
  });

  test('node.viewport.width + fixed heightMode', () => {
    const v = resolveNodeViewport({
      nodeViewport: {
        width: 768,
        height: 500,
        heightMode: 'fixed',
        label: '768',
      },
      override: undefined,
      layout: { defaultWidth: 390 },
      measuredHeight: 9999,
    });
    expect(v.width).toBe(768);
    expect(v.height).toBe(500);
    expect(v.heightMode).toBe('fixed');
  });

  test('override width побеждает', () => {
    const v = resolveNodeViewport({
      nodeViewport: { width: 390, height: 800, heightMode: 'auto' },
      override: { width: 1280, height: 800, heightMode: 'auto', label: '1280' },
      layout: undefined,
      measuredHeight: 1100,
    });
    expect(v.width).toBe(1280);
    expect(v.height).toBe(1100);
  });
});

describe('resolveViewportPresets', () => {
  test('JSON presets', () => {
    const p = resolveViewportPresets({
      viewportPresets: [
        { id: 'm', label: '360', width: 360 },
        { id: 't', label: '480', width: 480, height: 900 },
      ],
    });
    expect(p).toHaveLength(2);
    expect(p[0]?.width).toBe(360);
    expect(p[0]?.heightMode).toBe('fixed');
  });

  test('без JSON — builtin', () => {
    const p = resolveViewportPresets(undefined);
    expect(p.some((x) => x.width === 360)).toBe(true);
    expect(p.some((x) => x.width === 1920)).toBe(true);
  });
});

describe('resolveDefaultWidth', () => {
  test('из layout', () => {
    expect(resolveDefaultWidth({ defaultWidth: 1280 })).toBe(1280);
  });
});

describe('isConnectorNode', () => {
  const base: AppMapNode = {
    id: 'n1',
    kind: 'page',
    title: 'X',
    pathPattern: '/',
  };
  test('flag connector', () => {
    expect(isConnectorNode({ ...base, connector: true })).toBe(true);
  });
  test('kind layout', () => {
    expect(isConnectorNode({ ...base, kind: 'layout' })).toBe(true);
  });
  test('обычная page — false', () => {
    expect(isConnectorNode(base)).toBe(false);
  });
});

describe('connectorWorldSize', () => {
  test('при zoom 0.5 world = 2× screen', () => {
    const s = connectorWorldSize({
      zoom: 0.5,
      screenWidth: 100,
      screenHeight: 40,
      maxScreenWidth: 160,
      maxScreenHeight: 64,
      minScreenWidth: 48,
      minScreenHeight: 28,
    });
    expect(s.width).toBe(200);
    expect(s.height).toBe(80);
  });

  test('clamp max screen', () => {
    const s = connectorWorldSize({
      zoom: 1,
      screenWidth: 400,
      screenHeight: 200,
      maxScreenWidth: 160,
      maxScreenHeight: 64,
      minScreenWidth: 48,
      minScreenHeight: 28,
    });
    expect(s.width).toBe(160);
    expect(s.height).toBe(64);
  });
});
