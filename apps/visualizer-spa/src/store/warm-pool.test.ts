/**
 * Keep-alive warm pool через store.recomputeLive.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AppMapDocument } from '@live-app-map/schema';
import { useAppStore } from './app-store';

const doc: AppMapDocument = {
  schemaVersion: '1.0.0',
  projectName: 'warm-test',
  revision: 1,
  baseUrl: 'https://vite.localhost:5175',
  nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id: `route:/${id}`,
    kind: 'page' as const,
    title: id,
    pathPattern: `/${id}`,
    pathExample: `/${id}`,
    url: `https://vite.localhost:5175/${id}`,
  })),
  edges: [],
};

describe('warm keep-alive via recomputeLive', () => {
  beforeEach(() => {
    useAppStore.getState().clearMap();
    useAppStore.getState().setMaxLiveIframes(2);
    useAppStore.getState().setMaxWarmIframes(2);
  });

  test('уход из live → warm mounted; eviction LRU', () => {
    const s = useAppStore.getState();
    s.loadDocument(doc);
    // visible a,b → live
    s.setVisible(new Set(['route:/a', 'route:/b']));
    expect(useAppStore.getState().livePageIds.size).toBe(2);
    expect(useAppStore.getState().mountedPageIds.size).toBe(2);

    // pan: visible c,d — a,b уходят в warm
    s.setVisible(new Set(['route:/c', 'route:/d']));
    const after = useAppStore.getState();
    expect(after.livePageIds.has('route:/c')).toBe(true);
    expect(after.livePageIds.has('route:/d')).toBe(true);
    expect(after.warmPageIds.has('route:/a')).toBe(true);
    expect(after.warmPageIds.has('route:/b')).toBe(true);
    expect(after.mountedPageIds.size).toBe(4);

    // ещё pan: e + a live (a was warm) — warm cap 2, b may stay or go
    s.setVisible(new Set(['route:/e', 'route:/a']));
    const mid = useAppStore.getState();
    expect(mid.livePageIds.has('route:/e')).toBe(true);
    expect(mid.livePageIds.has('route:/a')).toBe(true);
    // mounted = live(2) + warm(≤2)
    expect(mid.mountedPageIds.size).toBeLessThanOrEqual(4);
    expect(mid.warmPageIds.size).toBeLessThanOrEqual(2);
  });

  test('pin остаётся mounted после ухода из viewport', () => {
    const s = useAppStore.getState();
    s.loadDocument(doc);
    s.setMaxWarmIframes(1);
    s.setVisible(new Set(['route:/a', 'route:/b']));
    s.togglePin('route:/a');
    s.setVisible(new Set(['route:/c', 'route:/d']));
    const after = useAppStore.getState();
    // a pin → warm even if not visible
    expect(after.mountedPageIds.has('route:/a')).toBe(true);
    expect(after.livePageIds.has('route:/a') || after.warmPageIds.has('route:/a')).toBe(
      true,
    );
  });
});
