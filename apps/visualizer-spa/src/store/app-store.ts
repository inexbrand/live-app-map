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
  DEFAULT_MAX_WARM,
  reconcile,
  reconcileWarmPool,
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
import { applyDogfoodToUrl, ensureMiniappHashRoute } from '../lib/dogfood-url';
import {
  rewriteUrlThroughTlsProxy,
  shouldUseTlsProxyForUrl,
} from '../lib/tls-proxy';
import { clampViewport } from '../lib/viewport';

/** Display scale ноды на холсте (viewport 1920×1080 * scale = preview). */
export type IframeScale = 0.25 | 0.35 | 0.5 | 0.75 | 1;

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

const MIN_LIVE_IFRAMES = 0;
/** 9999 = «без лимита» в UI и policy. */
const MAX_LIVE_IFRAMES_CAP = 9999;
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
  /** Keep-alive слотов сверх live (LRU). */
  maxWarmIframes: number;
  searchQuery: string;
  selectedPageId: string | null;
  highlightedPageIds: ReadonlySet<string>;
  pinnedPageIds: ReadonlySet<string>;
  visiblePageIds: ReadonlySet<string>;
  /** Активный live-бюджет (viewport/pin priority). */
  livePageIds: ReadonlySet<string>;
  /**
   * Warm keep-alive: iframe в DOM, state SPA не сбрасывается.
   * Не пересекается с livePageIds.
   */
  warmPageIds: ReadonlySet<string>;
  /** LRU warm, oldest first. */
  warmLruOrder: readonly string[];
  /** live ∪ warm — монтировать iframe. */
  mountedPageIds: ReadonlySet<string>;
  interactPageId: string | null;
  /** Активный инжект стейта по page id */
  activeStates: ReadonlyMap<string, string>;
  /** Runtime override размера окна (адаптив / пресет ширины) */
  nodeViewports: ReadonlyMap<string, DeviceViewport>;
  /**
   * Измеренная высота document iframe (heightMode=auto).
   * key = pageId, value = scrollHeight px.
   */
  contentHeights: ReadonlyMap<string, number>;
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
  /**
   * Self-signed HTTPS → same-origin proxy visualizer (/__lam_proxy/…).
   * По умолчанию включено для dogfood miniapp.
   */
  useTlsProxy: boolean;
  toast: string | null;
  loadDocument: (doc: AppMapDocument, warnings?: readonly Diagnostic[]) => void;
  loadUnknownJson: (raw: unknown) => void;
  clearMap: () => void;
  clearLoadError: () => void;
  setMode: (mode: ViewMode) => void;
  setIframeScale: (s: IframeScale) => void;
  setMaxLiveIframes: (n: number) => void;
  setMaxWarmIframes: (n: number) => void;
  setSearchQuery: (q: string) => void;
  selectPage: (id: string | null) => void;
  togglePin: (id: string) => void;
  setVisible: (ids: ReadonlySet<string>) => void;
  setBaseUrlOverride: (url: string) => void;
  setGlobalRole: (role: string) => void;
  setDogfoodMiniappInitData: (raw: string) => void;
  setDogfoodAdminAccessToken: (token: string) => void;
  setUseTlsProxy: (enabled: boolean) => void;
  applyPageState: (pageId: string, state: AppMapPageState | null) => void;
  setInteract: (id: string | null) => void;
  openPageInNewTab: (id: string) => void;
  setNodeViewport: (pageId: string, viewport: DeviceViewport | null) => void;
  getNodeViewport: (pageId: string) => DeviceViewport | undefined;
  /** Записать измеренную высоту контента (auto); no-op при шуме */
  setContentHeight: (pageId: string, height: number) => void;
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
const LS_TLS_PROXY = 'lam.dogfood.useTlsProxy';

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
type WithBaseUrlOptions = {
  /**
   * true — переписать все page URL с path+base (явный override пользователя).
   * false — сохранить абсолютные http(s) URL нод (multi-surface korbor-all).
   */
  readonly forceRewrite?: boolean;
};

/**
 * Число различных http(s) host:port среди absolute page/not-found URL.
 * ≥2 → multi-surface карта (korbor-all): forceRewrite нельзя — схлопнет хосты.
 *
 * @param doc - документ до rewrite
 * @returns число уникальных host:port
 */
export function countAbsolutePageHosts(doc: AppMapDocument): number {
  const hosts = new Set<string>();
  for (const n of doc.nodes) {
    if (n.kind !== 'page' && n.kind !== 'not-found') {
      continue;
    }
    if (!n.url) {
      continue;
    }
    try {
      const existing = new URL(n.url);
      if (existing.protocol === 'http:' || existing.protocol === 'https:') {
        hosts.add(existing.host);
      }
    } catch {
      // malformed url — ignore for host inventory
    }
  }
  return hosts.size;
}

function withBaseUrl(
  doc: AppMapDocument,
  baseUrl: string,
  options: WithBaseUrlOptions = {},
): WithBaseUrlResult {
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

  const forceRewrite = options.forceRewrite === true;

  const nodes = doc.nodes.map((n) => {
    if (n.kind !== 'page' && n.kind !== 'not-found') {
      return n;
    }
    // Multi-surface maps: keep absolute live URLs unless user forced base override
    if (!forceRewrite && n.url) {
      try {
        const existing = new URL(n.url);
        if (existing.protocol === 'http:' || existing.protocol === 'https:') {
          return n;
        }
      } catch {
        // fall through — materialize from path
      }
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
  // 0 / 9999 = unlimited
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded >= 9999) {
    return 9999;
  }
  return Math.min(MAX_LIVE_IFRAMES_CAP, Math.max(1, rounded));
}

function clampMaxWarm(n: number): number {
  if (!Number.isFinite(n)) {
    return DEFAULT_MAX_WARM;
  }
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded >= 9999) {
    return 9999;
  }
  return Math.min(MAX_LIVE_IFRAMES_CAP, Math.max(0, rounded));
}

export const useAppStore = create<AppStore>((set, get) => ({
  document: null,
  index: null,
  parseIssues: [],
  lastLoadError: null,
  mode: 'live',
  // 50% — ряд экранов читаем без гигантского world
  iframeScale: 0.5,
  maxLiveIframes: DEFAULT_MAX_LIVE,
  maxWarmIframes: DEFAULT_MAX_WARM,
  searchQuery: '',
  selectedPageId: null,
  highlightedPageIds: new Set(),
  pinnedPageIds: new Set(),
  visiblePageIds: new Set(),
  livePageIds: new Set(),
  warmPageIds: new Set(),
  warmLruOrder: [],
  mountedPageIds: new Set(),
  interactPageId: null,
  activeStates: new Map(),
  nodeViewports: new Map(),
  contentHeights: new Map(),
  logs: [],
  diagnosticsOpen: false,
  logFilterPageId: null,
  globalRole: '',
  baseUrlOverride: '',
  dogfoodMiniappInitData: readLs(LS_INIT),
  dogfoodAdminAccessToken: readLs(LS_ADMIN),
  useTlsProxy: readLs(LS_TLS_PROXY) !== '0',
  toast: null,

  loadDocument: (doc, warnings = []) => {
    const userOverride = get().baseUrlOverride.trim();
    const base = userOverride || doc.baseUrl || '';
    // Multi-surface (≥2 absolute hosts): never force-rewrite — UI preset path
    // всегда setBaseUrlOverride(preset.baseUrl) перед load; иначе korbor-all
    // схлопывается в один host (site :16001).
    const multiSurface = countAbsolutePageHosts(doc) >= 2;
    const result = base
      ? withBaseUrl(doc, base, {
          forceRewrite: userOverride.length > 0 && !multiSurface,
        })
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
      // Сброс resize-override + measure — дефолты из layout JSON
      nodeViewports: new Map(),
      contentHeights: new Map(),
      // Успех всегда сбрасывает lastLoadError; ошибка base — явный message.
      lastLoadError: result.error,
      toast: result.error !== null ? result.error : get().toast,
      pinnedPageIds: pinned,
      selectedPageId: null,
      highlightedPageIds: new Set(),
      activeStates: new Map(),
      visiblePageIds: new Set(),
      livePageIds: new Set(),
      mode: 'live',
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
      warmPageIds: new Set(),
      warmLruOrder: [],
      mountedPageIds: new Set(),
      activeStates: new Map(),
      nodeViewports: new Map(),
      contentHeights: new Map(),
      interactPageId: null,
      logFilterPageId: null,
    });
    get().pushLog({ level: 'info', source: 'system', message: 'Карта очищена' });
  },

  clearLoadError: () => set({ lastLoadError: null }),

  setMode: (mode) => {
    // Dogfood: только live — map-only/compact не нужны (всегда iframe).
    const next = mode === 'live' ? 'live' : 'live';
    set({ mode: next });
    get().recomputeLive();
  },

  setIframeScale: (iframeScale) => set({ iframeScale }),

  setMaxLiveIframes: (n) => {
    set({ maxLiveIframes: clampMaxLive(n) });
    get().recomputeLive();
  },

  setMaxWarmIframes: (n) => {
    set({ maxWarmIframes: clampMaxWarm(n) });
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

  setUseTlsProxy: (enabled) => {
    writeLs(LS_TLS_PROXY, enabled ? '1' : '0');
    set({ useTlsProxy: enabled });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: enabled
        ? 'TLS-proxy: вкл (self-signed → /__lam_proxy/…)'
        : 'TLS-proxy: выкл (прямой HTTPS origin)',
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

  setContentHeight: (pageId, height) => {
    if (!Number.isFinite(height) || height < 120) {
      return;
    }
    const rounded = Math.round(height);
    const prev = get().contentHeights.get(pageId);
    if (prev !== undefined && Math.abs(prev - rounded) <= 4) {
      return;
    }
    const next = new Map(get().contentHeights);
    next.set(pageId, rounded);
    set({ contentHeights: next });
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
    let url = applyDogfoodToUrl(withState, {
      miniappInitData: dogfoodMiniappInitData,
      adminAccessToken: dogfoodAdminAccessToken,
    });

    // Miniapp HashRouter: /feed → /#/feed (query остаётся в search)
    url = ensureMiniappHashRoute(url);

    // Self-signed HTTPS miniapp: same-origin proxy (secure:false на Vite)
    if (get().useTlsProxy && shouldUseTlsProxyForUrl(url)) {
      const origin =
        typeof globalThis.location !== 'undefined' && globalThis.location?.origin
          ? globalThis.location.origin
          : 'http://localhost:4310';
      url = rewriteUrlThroughTlsProxy(url, origin);
      // proxy path может снова «съесть» product path — нормализуем hash
      url = ensureMiniappHashRoute(url);
    }

    return url;
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
      set({
        livePageIds: new Set(),
        warmPageIds: new Set(),
        warmLruOrder: [],
        mountedPageIds: new Set(),
      });
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

    // Prefetch 1-hop соседей selected — прогрев без pin
    const prefetch = new Set<string>();
    if (s.selectedPageId !== null && s.index !== null) {
      for (const id of neighbors(s.index, s.selectedPageId)) {
        prefetch.add(id);
      }
    }

    // Hysteresis: уже LIVE чуть приоритетнее — меньше thrash при pan
    const recentLiveScore: Record<string, number> = {};
    for (const id of s.livePageIds) {
      recentLiveScore[id] = 5;
    }
    for (const id of s.warmPageIds) {
      recentLiveScore[id] = Math.max(recentLiveScore[id] ?? 0, 2);
    }

    const result = reconcile({
      mode: s.mode,
      maxLiveIframes: s.maxLiveIframes,
      maxPinned: DEFAULT_MAX_PINNED,
      candidates,
      pinned: s.pinnedPageIds,
      visible: s.visiblePageIds,
      selected: s.selectedPageId,
      prefetch,
      iframeAllowed,
      recentLiveScore,
    });

    const warm = reconcileWarmPool({
      liveIds: result.liveIds,
      previousLiveIds: s.livePageIds,
      previousWarmOrder: s.warmLruOrder,
      pinned: s.pinnedPageIds,
      maxWarm: s.maxWarmIframes,
      iframeAllowed,
    });

    const nextState = {
      livePageIds: result.liveIds,
      warmPageIds: warm.warmIds,
      warmLruOrder: warm.warmOrder,
      mountedPageIds: warm.mountedIds,
    };

    if (result.deferredPins.length > 0) {
      set({
        ...nextState,
        toast: `Pin отложен (бюджет iframe ${s.maxLiveIframes}): ${result.deferredPins.join(', ')}`,
      });
      return;
    }
    set(nextState);
  },
}));

export { DEFAULT_MAX_PINNED, DEFAULT_MAX_LIVE, DEFAULT_MAX_WARM };
export type { LiveAppMapDocument };
