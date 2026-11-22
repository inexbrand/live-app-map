/**
 * Срез открытой карты: загрузка, разбор JSON, очистка, базовый URL.
 */
import { indexDocument } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseAppMapDocument, parseLiveAppMapDocument, type Diagnostic } from '@live-app-map/schema';
import { checkBaseUrl, countAbsolutePageHosts, withBaseUrl } from './base-url';
import type { AppSlice, MapSlice } from './types';

/** Срез карты. */
export const createMapSlice: AppSlice<MapSlice> = (set, get) => ({
  document: null,
  index: null,
  parseIssues: [],
  lastLoadError: null,
  loadSeq: 0,
  baseUrlOverride: '',

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
      : { document: doc, error: null };
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
      index: indexDocument(normalized),
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
      loadSeq: get().loadSeq + 1,
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
      return true;
    }
    const asLive = parseLiveAppMapDocument(raw);
    if (asLive.ok) {
      const enterprise = liveAppMapToAppMap(asLive.document);
      get().loadDocument(enterprise, asLive.warnings);
      return true;
    }
    const message = `Не удалось разобрать JSON: ${
      asLive.errors[0]?.message ?? asApp.errors[0]?.message ?? 'неизвестная ошибка'
    }`;
    set({
      lastLoadError: message,
      toast: message,
    });
    get().pushLog({ level: 'error', source: 'system', message });
    return false;
  },

  setDocs: (docs) => {
    const doc = get().document;
    if (doc !== null) {
      set({ document: { ...doc, docs } });
    }
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

  setBaseUrlOverride: (url) => {
    set({ baseUrlOverride: url });
    const doc = get().document;
    if (!doc) {
      const trimmed = url.trim();
      if (trimmed === '') {
        set({ lastLoadError: null, toast: null });
        return;
      }
      const issue = checkBaseUrl(trimmed);
      if (issue === null) {
        set({
          lastLoadError: null,
          parseIssues: get().parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL'),
        });
      } else {
        set({ lastLoadError: issue.message, toast: issue.message, parseIssues: [issue.diagnostic] });
      }
      return;
    }
    const kept = get().parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL');
    get().loadDocument(doc, kept);
  },

  setLastLoadError: (lastLoadError) => set({ lastLoadError }),
});
