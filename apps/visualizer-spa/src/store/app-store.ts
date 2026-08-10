/**
 * Zustand store visualizer SPA.
 *
 * Контракт live URL: `resolveLiveUrl(id)` читает document, index, activeStates,
 * globalRole, baseUrlOverride. В React-компонентах подписывайтесь на *результат*
 * селектора `s => s.resolveLiveUrl(id)`, а не на ссылку метода — иначе смена
 * роли/стейта не перерисует iframe и drawer.
 */
import {
  applyStateToUrl,
  indexDocument,
  neighbors,
  resolveNodeUrl,
  type GraphIndex,
} from '@live-app-map/graph';
import {
  DEFAULT_MAX_LIVE,
  DEFAULT_MAX_PINNED,
  reconcile,
  type ViewMode,
} from '@live-app-map/iframe-policy';
import {
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
  type AppMapDocument,
  type AppMapPageState,
  type Diagnostic,
  type LiveAppMapDocument,
} from '@live-app-map/schema';
import { create } from 'zustand';

export type IframeScale = 0.5 | 0.75 | 1;

export type ActiveStateSel = {
  readonly pageId: string;
  readonly stateName: string;
};

const MIN_LIVE_IFRAMES = 1;
const MAX_LIVE_IFRAMES_CAP = 16;

type AppStore = {
  document: AppMapDocument | null;
  index: GraphIndex | null;
  parseIssues: Diagnostic[];
  /** Персистентная ошибка загрузки/parse (не только toast 4с) */
  lastLoadError: string | null;
  mode: ViewMode;
  iframeScale: IframeScale;
  maxLiveIframes: number;
  searchQuery: string;
  selectedPageId: string | null;
  highlightedPageIds: ReadonlySet<string>;
  pinnedPageIds: ReadonlySet<string>;
  visiblePageIds: ReadonlySet<string>;
  livePageIds: ReadonlySet<string>;
  interactPageId: string | null;
  /** Активный инжект стейта по page id */
  activeStates: ReadonlyMap<string, string>;
  /** Глобальная роль (Korbor): employer | recruiter | '' */
  globalRole: string;
  baseUrlOverride: string;
  toast: string | null;
  loadDocument: (doc: AppMapDocument, warnings?: readonly Diagnostic[]) => void;
  loadUnknownJson: (raw: unknown) => void;
  clearMap: () => void;
  clearLoadError: () => void;
  setMode: (mode: ViewMode) => void;
  setIframeScale: (s: IframeScale) => void;
  setMaxLiveIframes: (n: number) => void;
  setSearchQuery: (q: string) => void;
  selectPage: (id: string | null) => void;
  togglePin: (id: string) => void;
  setVisible: (ids: ReadonlySet<string>) => void;
  setBaseUrlOverride: (url: string) => void;
  setGlobalRole: (role: string) => void;
  applyPageState: (pageId: string, state: AppMapPageState | null) => void;
  setInteract: (id: string | null) => void;
  openPageInNewTab: (id: string) => void;
  /**
   * Собирает live URL с учётом globalRole и per-page state inject.
   * Per-page inject.role перекрывает global; query стейта мержится поверх.
   */
  resolveLiveUrl: (id: string) => string | null;
  setToast: (msg: string | null) => void;
  setLastLoadError: (msg: string | null) => void;
  recomputeLive: () => void;
};

function rebuildIndex(doc: AppMapDocument | null): GraphIndex | null {
  return doc ? indexDocument(doc) : null;
}

function withBaseUrl(doc: AppMapDocument, baseUrl: string): AppMapDocument {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return doc;
  }
  const nodes = doc.nodes.map((n) => {
    if (n.kind !== 'page' && n.kind !== 'not-found') {
      return n;
    }
    const path = n.pathExample ?? n.pathPattern;
    let url = n.url;
    try {
      url = new URL(path.startsWith('/') ? path : `/${path}`, trimmed).href;
    } catch {
      /* keep */
    }
    return { ...n, url };
  });
  return { ...doc, baseUrl: trimmed, nodes };
}

function clampMaxLive(n: number): number {
  if (!Number.isFinite(n)) {
    return DEFAULT_MAX_LIVE;
  }
  return Math.min(MAX_LIVE_IFRAMES_CAP, Math.max(MIN_LIVE_IFRAMES, Math.round(n)));
}

export const useAppStore = create<AppStore>((set, get) => ({
  document: null,
  index: null,
  parseIssues: [],
  lastLoadError: null,
  mode: 'map-only',
  iframeScale: 0.5,
  maxLiveIframes: DEFAULT_MAX_LIVE,
  searchQuery: '',
  selectedPageId: null,
  highlightedPageIds: new Set(),
  pinnedPageIds: new Set(),
  visiblePageIds: new Set(),
  livePageIds: new Set(),
  interactPageId: null,
  activeStates: new Map(),
  globalRole: '',
  baseUrlOverride: '',
  toast: null,

  loadDocument: (doc, warnings = []) => {
    const base = get().baseUrlOverride || doc.baseUrl || '';
    const normalized = base ? withBaseUrl(doc, base) : doc;
    const pinned = new Set(
      normalized.nodes.filter((n) => n.defaultPinned).map((n) => n.id),
    );
    set({
      document: normalized,
      index: rebuildIndex(normalized),
      parseIssues: [...warnings],
      lastLoadError: null,
      pinnedPageIds: pinned,
      selectedPageId: null,
      highlightedPageIds: new Set(),
      activeStates: new Map(),
      visiblePageIds: new Set(),
      livePageIds: new Set(),
    });
    get().recomputeLive();
  },

  loadUnknownJson: (raw) => {
    const asApp = parseAppMapDocument(raw);
    if (asApp.ok) {
      get().loadDocument(asApp.document, asApp.warnings);
      return;
    }
    const asLive = parseLiveAppMapDocument(raw);
    if (asLive.ok) {
      const enterprise = liveAppMapToAppMap(asLive.document);
      get().loadDocument(enterprise, asLive.warnings);
      return;
    }
    const message = `Не удалось разобрать JSON: ${
      asLive.errors[0]?.message ?? asApp.errors[0]?.message ?? 'неизвестная ошибка'
    }`;
    set({
      lastLoadError: message,
      toast: message,
    });
  },

  clearMap: () => {
    set({
      document: null,
      index: null,
      parseIssues: [],
      lastLoadError: null,
      selectedPageId: null,
      highlightedPageIds: new Set(),
      pinnedPageIds: new Set(),
      visiblePageIds: new Set(),
      livePageIds: new Set(),
      activeStates: new Map(),
      interactPageId: null,
    });
  },

  clearLoadError: () => set({ lastLoadError: null }),

  setMode: (mode) => {
    set({ mode });
    get().recomputeLive();
  },

  setIframeScale: (iframeScale) => set({ iframeScale }),

  setMaxLiveIframes: (n) => {
    set({ maxLiveIframes: clampMaxLive(n) });
    get().recomputeLive();
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  selectPage: (id) => {
    const index = get().index;
    if (!id || !index) {
      set({ selectedPageId: null, highlightedPageIds: new Set() });
      get().recomputeLive();
      return;
    }
    set({
      selectedPageId: id,
      highlightedPageIds: neighbors(index, id),
    });
    get().recomputeLive();
  },

  togglePin: (id) => {
    const next = new Set(get().pinnedPageIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= DEFAULT_MAX_PINNED) {
        set({
          toast: `Лимит pin: ${DEFAULT_MAX_PINNED}. Открепите другую страницу.`,
        });
        return;
      }
      next.add(id);
    }
    set({ pinnedPageIds: next });
    get().recomputeLive();
  },

  setVisible: (ids) => {
    set({ visiblePageIds: ids });
    get().recomputeLive();
  },

  setBaseUrlOverride: (url) => {
    set({ baseUrlOverride: url });
    const doc = get().document;
    if (doc) {
      get().loadDocument(doc, get().parseIssues);
    }
  },

  setGlobalRole: (role) => {
    set({ globalRole: role });
    get().recomputeLive();
  },

  applyPageState: (pageId, state) => {
    const next = new Map(get().activeStates);
    if (!state) {
      next.delete(pageId);
    } else {
      next.set(pageId, state.name);
    }
    set({ activeStates: next });
    get().recomputeLive();
  },

  setInteract: (id) => set({ interactPageId: id }),

  resolveLiveUrl: (id) => {
    const { document, index, activeStates, globalRole, baseUrlOverride } = get();
    if (!document || !index) {
      return null;
    }
    const node = index.nodesById.get(id);
    if (!node) {
      return null;
    }
    const base =
      resolveNodeUrl(node, baseUrlOverride || document.baseUrl) ??
      node.url ??
      null;
    if (!base) {
      return null;
    }

    const stateName = activeStates.get(id);
    const pageState = stateName
      ? node.states?.find((s) => s.name === stateName)
      : undefined;

    const role =
      pageState?.inject?.role !== undefined && pageState.inject.role !== ''
        ? pageState.inject.role
        : globalRole !== ''
          ? globalRole
          : undefined;

    if (pageState?.url) {
      return applyStateToUrl(pageState.url, {
        role,
        query: {
          ...(globalRole !== '' ? { lam_role: globalRole } : {}),
          ...pageState.inject?.query,
        },
        hash: pageState.inject?.hash,
      });
    }

    return applyStateToUrl(base, {
      role,
      query: {
        ...(globalRole !== '' ? { lam_role: globalRole } : {}),
        ...pageState?.inject?.query,
      },
      hash: pageState?.inject?.hash,
    });
  },

  openPageInNewTab: (id) => {
    const url = get().resolveLiveUrl(id);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },

  setToast: (toast) => set({ toast }),

  setLastLoadError: (lastLoadError) => set({ lastLoadError }),

  recomputeLive: () => {
    const s = get();
    if (!s.document) {
      set({ livePageIds: new Set() });
      return;
    }
    const candidates = s.document.nodes
      .filter((n) => n.kind === 'page' || n.kind === 'not-found')
      .map((n) => n.id);
    const iframeAllowed: Record<string, boolean> = {};
    for (const n of s.document.nodes) {
      iframeAllowed[n.id] =
        n.iframePolicy?.enabled !== false && Boolean(s.resolveLiveUrl(n.id));
    }
    const result = reconcile({
      mode: s.mode,
      maxLiveIframes: s.maxLiveIframes,
      maxPinned: DEFAULT_MAX_PINNED,
      candidates,
      pinned: s.pinnedPageIds,
      visible: s.visiblePageIds,
      selected: s.selectedPageId,
      prefetch: new Set(),
      iframeAllowed,
      recentLiveScore: {},
    });
    if (result.deferredPins.length > 0) {
      set({
        livePageIds: result.liveIds,
        toast: `Pin отложен (бюджет iframe): ${result.deferredPins.join(', ')}`,
      });
      return;
    }
    set({ livePageIds: result.liveIds });
  },
}));

export { DEFAULT_MAX_PINNED, DEFAULT_MAX_LIVE };
export type { LiveAppMapDocument };
