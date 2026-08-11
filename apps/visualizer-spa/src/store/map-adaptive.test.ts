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
});
