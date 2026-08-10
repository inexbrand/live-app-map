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
  type DeviceViewport,
  type Diagnostic,
  type LiveAppMapDocument,
} from '@live-app-map/schema';
import { create } from 'zustand';
import { applyDogfoodToUrl } from '../lib/dogfood-url';
import { clampViewport } from '../lib/viewport';

export type IframeScale = 0.5 | 0.75 | 1;

export type ActiveStateSel = {
  readonly pageId: string;
  readonly stateName: string;
};

/** Запись журнала visualizer / per-page (load, error, info). */
export type AppLogEntry = {
  readonly id: string;
  readonly ts: string;
  readonly level: 'info' | 'warn' | 'error';
  /** system | pageId */
  readonly source: string;
  readonly message: string;
};

const MIN_LIVE_IFRAMES = 1;
const MAX_LIVE_IFRAMES_CAP = 16;
const MAX_LOGS = 400;

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
  /** Runtime override размера окна (адаптив) */
  nodeViewports: ReadonlyMap<string, DeviceViewport>;
  /** Журнал системы и per-page load/error */
  logs: readonly AppLogEntry[];
  /** Панель логов </> открыта */
  diagnosticsOpen: boolean;
  /** Фильтр логов по page id (null = все) */
  logFilterPageId: string | null;
  /** Глобальная роль (Korbor): employer | recruiter | '' */
  globalRole: string;
  baseUrlOverride: string;
  /**
   * Dogfood: raw Telegram initData для miniapp (?lam_init_data=).
   * Сохраняется в localStorage visualizer origin.
   */
  dogfoodMiniappInitData: string;
  /** Dogfood: admin access token (?lam_access_token=) */
  dogfoodAdminAccessToken: string;
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
  setDogfoodMiniappInitData: (raw: string) => void;
  setDogfoodAdminAccessToken: (token: string) => void;
  applyPageState: (pageId: string, state: AppMapPageState | null) => void;
  setInteract: (id: string | null) => void;
  openPageInNewTab: (id: string) => void;
  setNodeViewport: (pageId: string, viewport: DeviceViewport | null) => void;
  getNodeViewport: (pageId: string) => DeviceViewport | undefined;
  pushLog: (
    entry: Omit<AppLogEntry, 'id' | 'ts'> & { readonly ts?: string },
  ) => void;
  clearLogs: () => void;
  setDiagnosticsOpen: (open: boolean) => void;
  setLogFilterPageId: (pageId: string | null) => void;
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

const LS_INIT = 'lam.dogfood.miniappInitData';
const LS_ADMIN = 'lam.dogfood.adminAccessToken';

function readLs(key: string): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeLs(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    if (value.trim() === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

/** Результат переписывания node.url относительно baseUrl. */
type WithBaseUrlResult = {
  readonly document: AppMapDocument;
  readonly error: string | null;
};

/**
 * Переписывает URL нод относительно base.
 * При невалидном base — исходный document + error (без silent keep URL).
 *
 * @param doc — текущий документ карты
 * @param baseUrl — новый base (override или document.baseUrl)
 * @returns document (переписанный или исходный) и error при невалидном base
 */
function withBaseUrl(doc: AppMapDocument, baseUrl: string): WithBaseUrlResult {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { document: doc, error: null };
  }

  let base: URL;
  try {
    base = new URL(trimmed);
  } catch {
    return {
      document: doc,
      error: `Некорректный Base URL: «${trimmed}»`,
    };
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return {
      document: doc,
      error: `Base URL: только http/https («${trimmed}»)`,
    };
  }

  const nodes = doc.nodes.map((n) => {
    if (n.kind !== 'page' && n.kind !== 'not-found') {
      return n;
    }
    const path = n.pathExample ?? n.pathPattern;
    try {
      const url = new URL(path.startsWith('/') ? path : `/${path}`, base).href;
      return { ...n, url };
    } catch {
      return n;
    }
  });
  return { document: { ...doc, baseUrl: trimmed, nodes }, error: null };
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
  iframeScale: 0.75,
  maxLiveIframes: DEFAULT_MAX_LIVE,
  searchQuery: '',
  selectedPageId: null,
  highlightedPageIds: new Set(),
  pinnedPageIds: new Set(),
  visiblePageIds: new Set(),
  livePageIds: new Set(),
  interactPageId: null,
  activeStates: new Map(),
  nodeViewports: new Map(),
  logs: [],
  diagnosticsOpen: false,
  logFilterPageId: null,
  globalRole: '',
  baseUrlOverride: '',
  dogfoodMiniappInitData: readLs(LS_INIT),
  dogfoodAdminAccessToken: readLs(LS_ADMIN),
  toast: null,

  loadDocument: (doc, warnings = []) => {
    const base = get().baseUrlOverride || doc.baseUrl || '';
    const result = base
      ? withBaseUrl(doc, base)
      : { document: doc, error: null as string | null };
    const normalized = result.document;
    const withoutBaseIssues = warnings.filter((d) => d.code !== 'INVALID_BASE_URL');
    const parseIssues: Diagnostic[] =
      result.error !== null
        ? [
            ...withoutBaseIssues,
            {
              code: 'INVALID_BASE_URL',
              severity: 'error',
              message: result.error,
              path: 'baseUrl',
              hint: 'Укажите полный http(s) URL, например http://localhost:5175',
            },
          ]
        : [...withoutBaseIssues];
    const pinned = new Set(
      normalized.nodes.filter((n) => n.defaultPinned).map((n) => n.id),
    );
    set({
      document: normalized,
      index: rebuildIndex(normalized),
      parseIssues,
      // Успех всегда сбрасывает lastLoadError; ошибка base — явный message.
      lastLoadError: result.error,
      toast: result.error !== null ? result.error : get().toast,
      pinnedPageIds: pinned,
      selectedPageId: null,
      highlightedPageIds: new Set(),
      activeStates: new Map(),
      nodeViewports: new Map(),
      visiblePageIds: new Set(),
      livePageIds: new Set(),
    });
    const pages = normalized.nodes.filter((n) => n.kind === 'page').length;
    get().pushLog({
      level: 'info',
      source: 'system',
      message: `Карта загружена: ${pages} экранов, revision ${normalized.revision}`,
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
    get().pushLog({ level: 'error', source: 'system', message });
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
      nodeViewports: new Map(),
      interactPageId: null,
      logFilterPageId: null,
    });
    get().pushLog({ level: 'info', source: 'system', message: 'Карта очищена' });
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
    if (!doc) {
      const trimmed = url.trim();
      if (trimmed === '') {
        set({ lastLoadError: null, toast: null });
        return;
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          const message = `Base URL: только http/https («${trimmed}»)`;
          set({
            lastLoadError: message,
            toast: message,
            parseIssues: [
              {
                code: 'INVALID_BASE_URL',
                severity: 'error',
                message,
                path: 'baseUrl',
              },
            ],
          });
        } else {
          set({
            lastLoadError: null,
            parseIssues: get().parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL'),
          });
        }
      } catch {
        const message = `Некорректный Base URL: «${trimmed}»`;
        set({
          lastLoadError: message,
          toast: message,
          parseIssues: [
            {
              code: 'INVALID_BASE_URL',
              severity: 'error',
              message,
              path: 'baseUrl',
            },
          ],
        });
      }
      return;
    }
    const kept = get().parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL');
    get().loadDocument(doc, kept);
  },

  setGlobalRole: (role) => {
    set({ globalRole: role });
    get().recomputeLive();
  },

  setDogfoodMiniappInitData: (raw) => {
    writeLs(LS_INIT, raw);
    set({ dogfoodMiniappInitData: raw });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: raw.trim()
        ? 'Dogfood: initData miniapp сохранён (подставится в live URL)'
        : 'Dogfood: initData miniapp очищен',
    });
    get().recomputeLive();
  },

  setDogfoodAdminAccessToken: (token) => {
    writeLs(LS_ADMIN, token);
    set({ dogfoodAdminAccessToken: token });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: token.trim()
        ? 'Dogfood: admin access token сохранён'
        : 'Dogfood: admin token очищен',
    });
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

  setNodeViewport: (pageId, viewport) => {
    const next = new Map(get().nodeViewports);
    if (viewport === null) {
      next.delete(pageId);
    } else {
      next.set(pageId, clampViewport(viewport));
    }
    set({ nodeViewports: next });
    get().pushLog({
      level: 'info',
      source: pageId,
      message:
        viewport === null
          ? 'Размер окна сброшен к appmap'
          : `Размер окна ${viewport.width}×${viewport.height}${viewport.label ? ` (${viewport.label})` : ''}`,
    });
  },

  getNodeViewport: (pageId) => {
    const override = get().nodeViewports.get(pageId);
    if (override) {
      return override;
    }
    return get().index?.nodesById.get(pageId)?.viewport;
  },

  pushLog: (entry) => {
    const full: AppLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: entry.ts ?? new Date().toISOString(),
      level: entry.level,
      source: entry.source,
      message: entry.message,
    };
    const logs = [...get().logs, full].slice(-MAX_LOGS);
    set({ logs });
  },

  clearLogs: () => set({ logs: [] }),

  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),

  setLogFilterPageId: (logFilterPageId) => set({ logFilterPageId }),

  resolveLiveUrl: (id) => {
    const {
      document,
      index,
      activeStates,
      globalRole,
      baseUrlOverride,
      dogfoodMiniappInitData,
      dogfoodAdminAccessToken,
    } = get();
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

    const withState = pageState?.url
      ? applyStateToUrl(pageState.url, {
          role,
          query: {
            ...(globalRole !== '' ? { lam_role: globalRole } : {}),
            ...pageState.inject?.query,
          },
          hash: pageState.inject?.hash,
        })
      : applyStateToUrl(base, {
          role,
          query: {
            ...(globalRole !== '' ? { lam_role: globalRole } : {}),
            ...pageState?.inject?.query,
          },
          hash: pageState?.inject?.hash,
        });

    // Dogfood inject: miniapp initData + admin token (Korbor читает query)
    return applyDogfoodToUrl(withState, {
      miniappInitData: dogfoodMiniappInitData,
      adminAccessToken: dogfoodAdminAccessToken,
    });
  },

  openPageInNewTab: (id) => {
    const url = get().resolveLiveUrl(id);
    if (!url) {
      return;
    }
    const openFn = globalThis.window?.open?.bind(globalThis.window);
    if (openFn) {
      openFn(url, '_blank', 'noopener,noreferrer');
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
