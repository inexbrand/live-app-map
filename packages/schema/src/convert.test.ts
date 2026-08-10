/**
 * Тесты границы convert: narrowing kind/to, roundtrip groups/layout/iframe/pin.
 */
import { describe, expect, test } from 'bun:test';
import {
  appMapToLiveAppMap,
  coerceEdgeKind,
  isEdgeKind,
  isNavigationEdgeKind,
  liveAppMapToAppMap,
} from './convert';
import type { AppMapDocument, LiveAppMapDocument } from './types';
import { FORMAT_VERSION } from './types';

function sampleAppMap(overrides: Partial<AppMapDocument> = {}): AppMapDocument {
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.1' },
    revision: 'rev1',
    project: { name: 'demo', root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5173',
    nodes: [
      {
        id: 'home',
        kind: 'page',
        title: 'Home',
        pathPattern: '/',
        pathExample: '/',
        groupIds: ['main'],
        defaultPinned: true,
        iframePolicy: { enabled: false, reason: 'csp' },
      },
      {
        id: 'feed',
        kind: 'page',
        title: 'Feed',
        pathPattern: '/feed',
        pathExample: '/feed',
        groupIds: ['main'],
        defaultPinned: false,
        iframePolicy: { enabled: true },
      },
      {
        id: 'layout-root',
        kind: 'layout',
        title: 'Root layout',
        pathPattern: '/',
      },
    ],
    edges: [
      {
        id: 'e-nav',
        from: 'home',
        to: 'feed',
        kind: 'link',
        confidence: 'high',
        label: 'Open feed',
      },
      {
        id: 'e-null-to',
        from: 'home',
        to: null,
        kind: 'link',
        confidence: 'low',
      },
      {
        id: 'e-wraps',
        from: 'layout-root',
        to: 'home',
        kind: 'wraps',
        confidence: 'high',
      },
    ],
    groups: [{ id: 'main', title: 'Main', color: '#3366ff', order: 1 }],
    layout: { algorithm: 'dagre', direction: 'TB' },
    ...overrides,
  };
}

function sampleLive(overrides: Partial<LiveAppMapDocument> = {}): LiveAppMapDocument {
  return {
    version: '1.0',
    baseUrl: 'http://localhost:5173',
    app: { name: 'demo', generatedAt: '2026-01-01T00:00:00.000Z' },
    pages: [
      {
        id: 'home',
        title: 'Home',
        path: '/',
        group: 'main',
        defaultPinned: true,
        iframeDisabled: true,
      },
      {
        id: 'feed',
        title: 'Feed',
        path: '/feed',
        group: 'main',
        defaultPinned: false,
        iframeDisabled: false,
      },
    ],
    edges: [
      { id: 'e1', from: 'home', to: 'feed', kind: 'navigation', label: 'Open' },
      { from: 'feed', to: 'home', kind: 'not-a-real-kind' },
      { from: 'home', to: 'feed', kind: undefined },
    ],
    groups: [{ id: 'main', title: 'Main', color: '#3366ff', order: 1 }],
    layout: { algorithm: 'dagre', direction: 'TB' },
    ...overrides,
  };
}

describe('coerceEdgeKind / isEdgeKind', () => {
  test('распознаёт канонические kind', () => {
    expect(isEdgeKind('link')).toBe(true);
    expect(isEdgeKind('navigation')).toBe(true);
    expect(isEdgeKind('deep-link')).toBe(true);
    expect(isEdgeKind('bogus')).toBe(false);
  });

  test('дефолт unknown для пустого и неизвестного', () => {
    expect(coerceEdgeKind(undefined)).toBe('unknown');
    expect(coerceEdgeKind('')).toBe('unknown');
    expect(coerceEdgeKind('totally-invalid')).toBe('unknown');
    expect(coerceEdgeKind('redirect')).toBe('redirect');
  });

  test('навигационные kind для viewer', () => {
    expect(isNavigationEdgeKind('link')).toBe(true);
    expect(isNavigationEdgeKind('wraps')).toBe(false);
    expect(isNavigationEdgeKind('parent')).toBe(false);
    expect(isNavigationEdgeKind('parallel')).toBe(false);
  });
});

describe('appMapToLiveAppMap — narrowing edges', () => {
  test('отбрасывает null to и non-navigation kind без as-cast path', () => {
    const live = appMapToLiveAppMap(sampleAppMap());
    expect(live.edges).toHaveLength(1);
    expect(live.edges[0]).toEqual({
      id: 'e-nav',
      from: 'home',
      to: 'feed',
      label: 'Open feed',
      kind: 'link',
      raw: undefined,
      metadata: undefined,
    });
    // layout/structure ноды не попадают в pages
    expect(live.pages.map((p) => p.id).sort()).toEqual(['feed', 'home']);
  });

  test('прокидывает groups, layout, defaultPinned, iframeDisabled', () => {
    const live = appMapToLiveAppMap(sampleAppMap());
    expect(live.groups).toEqual([
      { id: 'main', title: 'Main', color: '#3366ff', order: 1 },
    ]);
    expect(live.layout).toEqual({ algorithm: 'dagre', direction: 'TB' });

    const home = live.pages.find((p) => p.id === 'home');
    expect(home?.defaultPinned).toBe(true);
    expect(home?.iframeDisabled).toBe(true);
    expect(home?.group).toBe('main');

    const feed = live.pages.find((p) => p.id === 'feed');
    expect(feed?.defaultPinned).toBe(false);
    expect(feed?.iframeDisabled).toBe(false);
  });
});

describe('liveAppMapToAppMap — kind coercion', () => {
  test('невалидный kind → typed default unknown; валидный сохраняется', () => {
    const enterprise = liveAppMapToAppMap(sampleLive());
    const kinds = enterprise.edges.map((e) => e.kind);
    expect(kinds).toContain('navigation');
    expect(kinds.filter((k) => k === 'unknown')).toHaveLength(2);
    for (const edge of enterprise.edges) {
      expect(isEdgeKind(edge.kind)).toBe(true);
    }
  });

  test('groups, layout, defaultPinned, iframePolicy из live', () => {
    const enterprise = liveAppMapToAppMap(sampleLive());
    expect(enterprise.groups).toEqual([
      { id: 'main', title: 'Main', color: '#3366ff', order: 1 },
    ]);
    expect(enterprise.layout).toEqual({ algorithm: 'dagre', direction: 'TB' });

    const home = enterprise.nodes.find((n) => n.id === 'home');
    expect(home?.defaultPinned).toBe(true);
    expect(home?.iframePolicy?.enabled).toBe(false);
    expect(home?.groupIds).toEqual(['main']);

    const feed = enterprise.nodes.find((n) => n.id === 'feed');
    expect(feed?.defaultPinned).toBe(false);
    expect(feed?.iframePolicy?.enabled).toBe(true);
  });
});

describe('roundtrip convert', () => {
  test('live → appmap → live: groups, layout, defaultPinned, iframeDisabled', () => {
    const liveIn = sampleLive({
      edges: [{ id: 'e1', from: 'home', to: 'feed', kind: 'link', label: 'Open' }],
    });
    const enterprise = liveAppMapToAppMap(liveIn);
    const liveOut = appMapToLiveAppMap(enterprise);

    expect(liveOut.groups).toEqual(liveIn.groups);
    expect(liveOut.layout).toEqual(liveIn.layout);

    const home = liveOut.pages.find((p) => p.id === 'home');
    expect(home?.defaultPinned).toBe(true);
    expect(home?.iframeDisabled).toBe(true);
    expect(home?.group).toBe('main');

    const feed = liveOut.pages.find((p) => p.id === 'feed');
    expect(feed?.defaultPinned).toBe(false);
    expect(feed?.iframeDisabled).toBe(false);

    expect(liveOut.edges).toHaveLength(1);
    expect(liveOut.edges[0]?.from).toBe('home');
    expect(liveOut.edges[0]?.to).toBe('feed');
    expect(liveOut.edges[0]?.kind).toBe('link');
  });

  test('appmap → live → appmap: groups, layout, pin, iframePolicy', () => {
    const appIn = sampleAppMap({
      edges: [
        {
          id: 'e-nav',
          from: 'home',
          to: 'feed',
          kind: 'push',
          confidence: 'high',
        },
      ],
    });
    const live = appMapToLiveAppMap(appIn);
    const appOut = liveAppMapToAppMap(live);

    expect(appOut.groups).toEqual(appIn.groups);
    expect(appOut.layout).toEqual(appIn.layout);

    const home = appOut.nodes.find((n) => n.id === 'home');
    expect(home?.defaultPinned).toBe(true);
    expect(home?.iframePolicy?.enabled).toBe(false);

    const feed = appOut.nodes.find((n) => n.id === 'feed');
    expect(feed?.defaultPinned).toBe(false);
    expect(feed?.iframePolicy?.enabled).toBe(true);

    expect(appOut.edges).toHaveLength(1);
    expect(appOut.edges[0]?.kind).toBe('push');
    expect(appOut.edges[0]?.to).toBe('feed');
  });
});
