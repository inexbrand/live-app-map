/**
 * Unit-тесты resolveLiveUrl: global role, per-page override, null document.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AppMapDocument, AppMapPageState } from '@live-app-map/schema';
import { useAppStore } from './app-store';

const miniDoc: AppMapDocument = {
  formatVersion: 1,
  kind: 'live-app-map',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generator: { name: 'test', version: '0' },
  revision: 't1',
  project: { root: '.', framework: 'manual', name: 'mini' },
  baseUrl: 'https://vite.localhost:5175',
  nodes: [
    {
      id: 'route:/feed',
      kind: 'page',
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
      kind: 'page',
      title: 'Create vacancy',
      pathPattern: '/employer/create',
      pathExample: '/employer/create',
      url: 'https://vite.localhost:5175/employer/create',
      states: [
        {
          name: 'employer',
          note: 'Клиент создаёт вакансию',
          inject: { role: 'employer', query: { lam_role: 'employer' } },
        },
      ],
    },
  ],
  edges: [],
};

describe('resolveLiveUrl', () => {
  beforeEach(() => {
    useAppStore.getState().clearMap();
    useAppStore.getState().setGlobalRole('');
    useAppStore.getState().setLastLoadError(null);
  });

  test('null document → null URL', () => {
    expect(useAppStore.getState().document).toBeNull();
    expect(useAppStore.getState().resolveLiveUrl('route:/feed')).toBeNull();
  });

  test('unknown page id → null', () => {
    useAppStore.getState().loadDocument(miniDoc);
    expect(useAppStore.getState().resolveLiveUrl('missing')).toBeNull();
  });

  test('global recruiter role injects lam_role', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setGlobalRole('recruiter');
    const url = useAppStore.getState().resolveLiveUrl('route:/feed');
    expect(url).toBeTruthy();
    expect(url).toContain('lam_role=recruiter');
    expect(url).toContain('/feed');
  });

  test('global employer role injects lam_role', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setGlobalRole('employer');
    const url = useAppStore.getState().resolveLiveUrl('route:/feed');
    expect(url).toContain('lam_role=employer');
  });

  test('per-page state inject.role wins over global', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setGlobalRole('recruiter');
    const createState = miniDoc.nodes[1]!.states![0]! as AppMapPageState;
    useAppStore.getState().applyPageState('route:/employer/create', createState);
    const url = useAppStore.getState().resolveLiveUrl('route:/employer/create');
    expect(url).toContain('lam_role=employer');
    expect(url).toContain('/employer/create');
    // global recruiter не должен «перебить» page employer после merge query стейта
    expect(url).not.toMatch(/lam_role=recruiter/);
  });

  test('clear page state → снова global role', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setGlobalRole('recruiter');
    const createState = miniDoc.nodes[1]!.states![0]! as AppMapPageState;
    useAppStore.getState().applyPageState('route:/employer/create', createState);
    useAppStore.getState().applyPageState('route:/employer/create', null);
    const url = useAppStore.getState().resolveLiveUrl('route:/employer/create');
    expect(url).toContain('lam_role=recruiter');
  });

  test('loadUnknownJson fail → lastLoadError, document stays null', () => {
    useAppStore.getState().loadUnknownJson({ not: 'a map' });
    const s = useAppStore.getState();
    expect(s.document).toBeNull();
    expect(s.lastLoadError).toBeTruthy();
    expect(s.lastLoadError).toContain('Не удалось разобрать JSON');
  });

  test('успешный loadDocument сбрасывает lastLoadError', () => {
    useAppStore.getState().setLastLoadError('старая ошибка');
    useAppStore.getState().loadDocument(miniDoc);
    expect(useAppStore.getState().lastLoadError).toBeNull();
    expect(useAppStore.getState().document).not.toBeNull();
  });

  test('setMaxLiveIframes clamp 1–16 + recompute', () => {
    useAppStore.getState().loadDocument(miniDoc);
    useAppStore.getState().setMode('live');
    useAppStore.getState().setMaxLiveIframes(0);
    expect(useAppStore.getState().maxLiveIframes).toBe(1);
    useAppStore.getState().setMaxLiveIframes(99);
    expect(useAppStore.getState().maxLiveIframes).toBe(16);
    useAppStore.getState().setMaxLiveIframes(4);
    expect(useAppStore.getState().maxLiveIframes).toBe(4);
  });
});
