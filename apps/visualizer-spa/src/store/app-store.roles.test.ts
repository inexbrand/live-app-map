import { describe, expect, test, beforeEach } from 'bun:test';
import { useAppStore } from './app-store';

const miniDoc = {
  formatVersion: 1 as const,
  kind: 'live-app-map' as const,
  generatedAt: '2026-01-01T00:00:00.000Z',
  generator: { name: 'test', version: '0' },
  revision: 't1',
  project: { root: '.', framework: 'manual' as const, name: 'mini' },
  baseUrl: 'https://vite.localhost:5175',
  nodes: [
    {
      id: 'route:/feed',
      kind: 'page' as const,
      title: 'Feed',
      pathPattern: '/feed',
      pathExample: '/feed',
      url: 'https://vite.localhost:5175/feed',
      states: [
        {
          name: 'recruiter',
          inject: { role: 'recruiter', query: { lam_role: 'recruiter' } },
        },
        {
          name: 'employer',
          inject: { role: 'employer', query: { lam_role: 'employer' } },
        },
      ],
    },
    {
      id: 'route:/employer/create',
      kind: 'page' as const,
      title: 'Create vacancy',
      pathPattern: '/employer/create',
      pathExample: '/employer/create',
      url: 'https://vite.localhost:5175/employer/create',
      states: [
        {
          name: 'employer',
          inject: { role: 'employer', query: { lam_role: 'employer' } },
        },
      ],
    },
  ],
  edges: [],
};

describe('useAppStore resolveLiveUrl roles', () => {
  beforeEach(() => {
    useAppStore.getState().clearMap();
    useAppStore.getState().setGlobalRole('');
  });

  test('global recruiter role injects query', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setGlobalRole('recruiter');
    const url = useAppStore.getState().resolveLiveUrl('route:/feed');
    expect(url).toContain('lam_role=recruiter');
  });

  test('page state employer overrides for create', () => {
    useAppStore.getState().loadDocument(miniDoc);
    const create = miniDoc.nodes[1]!.states![0]!;
    useAppStore.getState().applyPageState('route:/employer/create', create);
    const url = useAppStore.getState().resolveLiveUrl('route:/employer/create');
    expect(url).toContain('lam_role=employer');
    expect(url).toContain('/employer/create');
  });
});
