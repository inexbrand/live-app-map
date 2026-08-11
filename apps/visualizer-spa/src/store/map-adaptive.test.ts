/**
 * Map-level adaptive: setMapDeviceViewport → resolveNodeViewport for pages.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AppMapDocument } from '@live-app-map/schema';
import { resolveNodeViewport } from '../lib/viewport';
import { useAppStore } from './app-store';

const doc: AppMapDocument = {
  schemaVersion: '1.0.0',
  projectName: 'adaptive-test',
  revision: 1,
  baseUrl: 'https://vite.localhost:5175',
  layout: {
    algorithm: 'row',
    defaultWidth: 390,
    defaultHeight: 844,
    defaultHeightMode: 'fixed',
    defaultDeviceViewport: {
      width: 390,
      height: 844,
      label: '390',
      heightMode: 'fixed',
    },
  },
  nodes: [
    {
      id: 'route:/a',
      kind: 'page',
      title: 'A',
      pathPattern: '/a',
      pathExample: '/a',
      url: 'https://vite.localhost:5175/a',
    },
    {
      id: 'route:/b',
      kind: 'page',
      title: 'B',
      pathPattern: '/b',
      pathExample: '/b',
      url: 'https://vite.localhost:5175/b',
    },
    {
      id: 'route:/c',
      kind: 'page',
      title: 'C fixed page',
      pathPattern: '/c',
      pathExample: '/c',
      url: 'https://vite.localhost:5175/c',
      viewport: {
        width: 320,
        height: 568,
        label: 'page-only',
        heightMode: 'fixed',
      },
    },
  ],
  edges: [],
};

describe('map global adaptive', () => {
  beforeEach(() => {
    useAppStore.getState().clearMap();
  });

  test('setMapDeviceViewport applies same size to pages without viewport', () => {
    useAppStore.getState().loadDocument(doc);
    useAppStore.getState().setMapDeviceViewport({
      width: 768,
      height: 1024,
      label: 'tablet',
      heightMode: 'fixed',
    });
    const layout = useAppStore.getState().document?.layout;
    expect(layout?.defaultDeviceViewport?.width).toBe(768);
    expect(layout?.defaultHeightMode).toBe('fixed');

    const a = resolveNodeViewport({
      nodeViewport: useAppStore.getState().index?.nodesById.get('route:/a')
        ?.viewport,
      layout: useAppStore.getState().document?.layout,
      measuredHeight: 99999,
    });
    const b = resolveNodeViewport({
      nodeViewport: useAppStore.getState().index?.nodesById.get('route:/b')
        ?.viewport,
      layout: useAppStore.getState().document?.layout,
      measuredHeight: 1,
    });
    expect(a.width).toBe(768);
    expect(a.height).toBe(1024);
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
    expect(a.heightMode).toBe('fixed');
  });

  test('per-page viewport still wins over map adaptive', () => {
    useAppStore.getState().loadDocument(doc);
    useAppStore.getState().setMapViewportPreset('w1920');
    const c = resolveNodeViewport({
      nodeViewport: useAppStore.getState().index?.nodesById.get('route:/c')
        ?.viewport,
      layout: useAppStore.getState().document?.layout,
    });
    expect(c.width).toBe(320);
    expect(c.height).toBe(568);
  });

  test('setMapViewportPreset writes layout from builtin', () => {
    useAppStore.getState().loadDocument(doc);
    useAppStore.getState().setMapViewportPreset('w480');
    const ddv = useAppStore.getState().document?.layout?.defaultDeviceViewport;
    expect(ddv?.width).toBe(480);
    expect(ddv?.height).toBe(900);
  });

  test('incomplete map viewportPresets still resolve w1024 and w1920×1080', () => {
    // Repro skeptic: miniapp-like partial list without w1024, wrong w1920 height in JSON
    useAppStore.getState().loadDocument({
      ...doc,
      layout: {
        ...doc.layout,
        viewportPresets: [
          { id: 'w390', label: '390', width: 390, height: 844 },
          { id: 'w1920', label: '1920', width: 1920, height: 800 },
        ],
      },
    });
    // w1024 missing from JSON → builtin merge
    useAppStore.getState().setMapViewportPreset('w1024');
    const after1024 =
      useAppStore.getState().document?.layout?.defaultDeviceViewport;
    expect(after1024?.width).toBe(1024);
    expect(after1024?.height).toBe(900);

    // w1920 in JSON with height 800 → JSON wins (merge overlay)
    useAppStore.getState().setMapViewportPreset('w1920');
    const after1920 =
      useAppStore.getState().document?.layout?.defaultDeviceViewport;
    expect(after1920?.width).toBe(1920);
    expect(after1920?.height).toBe(800);

    // pages without viewport follow map adaptive (not measure)
    const a = resolveNodeViewport({
      layout: useAppStore.getState().document?.layout,
      measuredHeight: 50_000,
    });
    expect(a.width).toBe(1920);
    expect(a.height).toBe(800);
    expect(a.heightMode).toBe('fixed');
  });

  test('fixed path never uses contentHeights / measuredHeight', () => {
    useAppStore.getState().loadDocument(doc);
    useAppStore.getState().setContentHeight('route:/a', 12_000);
    const layout = useAppStore.getState().document?.layout;
    const measured = useAppStore.getState().contentHeights.get('route:/a');
    expect(measured).toBe(12_000);
    const v = resolveNodeViewport({
      nodeViewport: undefined,
      layout,
      measuredHeight: measured,
    });
    expect(v.heightMode).toBe('fixed');
    expect(v.height).toBe(844);
    expect(v.height).not.toBe(12_000);
  });
});
