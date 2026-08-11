/**
 * Pin-лимит, loadUnknownJson, invalid baseUrl, role+query в live URL.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AppMapDocument, AppMapPageState } from '@live-app-map/schema';
import { DEFAULT_MAX_PINNED, useAppStore } from './app-store';

const pinDoc: AppMapDocument = {
  formatVersion: 1,
  kind: 'live-app-map',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generator: { name: 'test', version: '0' },
  revision: 'pin-1',
  project: { root: '.', framework: 'manual', name: 'pin-doc' },
  baseUrl: 'https://vite.localhost:5175',
  nodes: Array.from({ length: DEFAULT_MAX_PINNED + 2 }, (_, i) => ({
    id: `route:/p${i}`,
    kind: 'page' as const,
    title: `Page ${i}`,
    pathPattern: `/p${i}`,
    pathExample: `/p${i}`,
    url: `https://vite.localhost:5175/p${i}`,
  })),
  edges: [],
};

const roleQueryDoc: AppMapDocument = {
  formatVersion: 1,
  kind: 'live-app-map',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generator: { name: 'test', version: '0' },
  revision: 'rq-1',
  project: { root: '.', framework: 'manual', name: 'role-query' },
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
          name: 'recruiter-tab',
          inject: {
            role: 'recruiter',
            query: { lam_role: 'recruiter', tab: 'mine', filter: 'open' },
          },
        },
      ],
    },
  ],
  edges: [],
};

describe('app-store pin / load / base', () => {
  beforeEach(() => {
    const s = useAppStore.getState();
    s.clearMap();
    s.setGlobalRole('');
    s.setLastLoadError(null);
    s.setToast(null);
    s.setBaseUrlOverride('');
    s.setUseTlsProxy(false);
  });

  test('loadUnknownJson invalid → lastLoadError + toast, document null', () => {
    useAppStore.getState().loadUnknownJson({ foo: 1 });
    const s = useAppStore.getState();
    expect(s.document).toBeNull();
    expect(s.lastLoadError).toBeTruthy();
    expect(s.lastLoadError).toContain('Не удалось разобрать JSON');
    expect(s.toast).toBe(s.lastLoadError);
  });

  test('pin over DEFAULT_MAX_PINNED → toast, size не растёт', () => {
    useAppStore.getState().loadDocument(pinDoc);
    for (let i = 0; i < DEFAULT_MAX_PINNED; i += 1) {
      useAppStore.getState().togglePin(`route:/p${i}`);
    }
    expect(useAppStore.getState().pinnedPageIds.size).toBe(DEFAULT_MAX_PINNED);

    useAppStore.getState().setToast(null);
    useAppStore.getState().togglePin(`route:/p${DEFAULT_MAX_PINNED}`);

    const s = useAppStore.getState();
    expect(s.pinnedPageIds.size).toBe(DEFAULT_MAX_PINNED);
    expect(s.pinnedPageIds.has(`route:/p${DEFAULT_MAX_PINNED}`)).toBe(false);
    expect(s.toast).toBeTruthy();
    expect(s.toast).toContain(`Лимит pin: ${DEFAULT_MAX_PINNED}`);
  });

  test('togglePin unpin при лимите — без toast, size уменьшается', () => {
    useAppStore.getState().loadDocument(pinDoc);
    for (let i = 0; i < DEFAULT_MAX_PINNED; i += 1) {
      useAppStore.getState().togglePin(`route:/p${i}`);
    }
    useAppStore.getState().setToast(null);
    useAppStore.getState().togglePin('route:/p0');
    const s = useAppStore.getState();
    expect(s.pinnedPageIds.size).toBe(DEFAULT_MAX_PINNED - 1);
    expect(s.pinnedPageIds.has('route:/p0')).toBe(false);
    expect(s.toast).toBeNull();
  });

  test('role + query merge в resolveLiveUrl (тот же URL что openPageInNewTab)', () => {
    useAppStore.getState().loadDocument(roleQueryDoc);
    useAppStore.getState().setGlobalRole('employer');
    const st = roleQueryDoc.nodes[0]!.states![0]! as AppMapPageState;
    useAppStore.getState().applyPageState('route:/feed', st);

    const url = useAppStore.getState().resolveLiveUrl('route:/feed');
    expect(url).toBeTruthy();
    expect(typeof url).toBe('string');
    if (url === null) {
      throw new Error('expected live URL');
    }
    expect(url).toContain('#/feed');
    expect(url).toContain('lam_role=recruiter');
    expect(url).toContain('tab=mine');
    expect(url).toContain('filter=open');
    expect(url).not.toMatch(/lam_role=employer/);
    // openPageInNewTab открывает ровно resolveLiveUrl(id) — без DOM-window в unit
    expect(url.startsWith('https://vite.localhost:5175/')).toBe(true);
  });

  test('withBaseUrl: invalid base → lastLoadError + parseIssues, URL нод не silent-rewrite', () => {
    useAppStore.getState().loadDocument(roleQueryDoc);
    const before = useAppStore.getState().document?.nodes[0]?.url;
    expect(before).toBe('https://vite.localhost:5175/feed');

    useAppStore.getState().setBaseUrlOverride('not-a-valid-url');

    const s = useAppStore.getState();
    expect(s.lastLoadError).toBeTruthy();
    expect(s.lastLoadError).toContain('Некорректный Base URL');
    expect(s.toast).toContain('Некорректный Base URL');
    expect(s.parseIssues.some((d) => d.code === 'INVALID_BASE_URL')).toBe(true);
    // silent keep запрещён как «успех»: baseUrl документа не подменяется невалидным
    expect(s.document?.baseUrl).toBe('https://vite.localhost:5175');
    expect(s.document?.nodes[0]?.url).toBe(before);
  });

  test('withBaseUrl: valid override переписывает node.url', () => {
    useAppStore.getState().loadDocument(roleQueryDoc);
    useAppStore.getState().setBaseUrlOverride('http://localhost:9999');
    const s = useAppStore.getState();
    expect(s.lastLoadError).toBeNull();
    expect(s.parseIssues.some((d) => d.code === 'INVALID_BASE_URL')).toBe(false);
    expect(s.document?.baseUrl).toBe('http://localhost:9999');
    expect(s.document?.nodes[0]?.url).toBe('http://localhost:9999/feed');
  });

  test('withBaseUrl: non-http protocol → error', () => {
    useAppStore.getState().loadDocument(roleQueryDoc);
    useAppStore.getState().setBaseUrlOverride('file:///tmp/map');
    const s = useAppStore.getState();
    expect(s.lastLoadError).toContain('http/https');
    expect(s.parseIssues.some((d) => d.code === 'INVALID_BASE_URL')).toBe(true);
    expect(s.document?.nodes[0]?.url).toBe('https://vite.localhost:5175/feed');
  });
});
