/**
 * Срез открытой карты: загрузка, разбор JSON, очистка, базовый URL.
 */
import { indexDocument } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseAppMapDocument, parseLiveAppMapDocument, type Diagnostic } from '@live-app-map/schema';
import { checkBaseUrl, countAbsolutePageHosts, withBaseUrl } from './base-url';
import type { AppSlice, MapSlice } from './types';

type AppMapDocument = Parameters<typeof indexDocument>[0];

/**
 * Карта к загрузке: base — введённый пользователем, иначе из карты; ошибка base —
 * в замечаниях разбора с подсказкой.
 */
function normalizeForLoad(doc: AppMapDocument, userOverride: string, warnings: readonly Diagnostic[]): { readonly normalized: AppMapDocument; readonly parseIssues: Diagnostic[]; readonly error: string | null } {
  const base = userOverride || doc.baseUrl || '';
  // Multi-surface (≥2 absolute hosts): never force-rewrite — UI preset path
  // всегда setBaseUrlOverride(preset.baseUrl) перед load; иначе korbor-all
  // схлопывается в один host (site :16001).
  const multiSurface = countAbsolutePageHosts(doc) >= 2;
  const result = base ? withBaseUrl(doc, base, { forceRewrite: userOverride.length > 0 && !multiSurface }) : { document: doc, error: null };
  const withoutBaseIssues = warnings.filter((d) => d.code !== 'INVALID_BASE_URL');
  const baseIssue: Diagnostic[] = result.error === null ? [] : [{
    code: 'INVALID_BASE_URL',
    severity: 'error',
    message: result.error,
    path: 'baseUrl',
    hint: 'Укажите полный http(s) URL, например http://localhost:5175',
  }];
  return { normalized: result.document, parseIssues: [...withoutBaseIssues, ...baseIssue], error: result.error };
}

/** JSON карты: внутренний формат AppMap, иначе Live App Map; не разобрался — текст ошибки. */
function parseAnyMap(raw: unknown): { readonly ok: true; readonly document: AppMapDocument; readonly warnings: readonly Diagnostic[] } | { readonly ok: false; readonly message: string } {
  const asApp = parseAppMapDocument(raw);
  if (asApp.ok) {
    return { ok: true, document: asApp.document, warnings: asApp.warnings };
  }
  const asLive = parseLiveAppMapDocument(raw);
  if (asLive.ok) {
    return { ok: true, document: liveAppMapToAppMap(asLive.document), warnings: asLive.warnings };
  }
  return { ok: false, message: `Не удалось разобрать JSON: ${asLive.errors[0]?.message ?? asApp.errors[0]?.message ?? 'неизвестная ошибка'}` };
}

/** Base введён без открытой карты: пусто — сброс ошибки, иначе проверка адреса. */
function baseCheckWithoutMap(trimmed: string, parseIssues: readonly Diagnostic[]): { lastLoadError: string | null; toast?: string | null; parseIssues?: Diagnostic[] } {
  if (trimmed === '') {
    return { lastLoadError: null, toast: null };
  }
  const issue = checkBaseUrl(trimmed);
  return issue === null
    ? { lastLoadError: null, parseIssues: parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL') }
    : { lastLoadError: issue.message, toast: issue.message, parseIssues: [issue.diagnostic] };
}

/** Срез карты. */
export const createMapSlice: AppSlice<MapSlice> = (set, get) => ({
  document: null,
  index: null,
  parseIssues: [],
  lastLoadError: null,
  loadSeq: 0,
  baseUrlOverride: '',

  loadDocument: (doc, warnings = []) => {
    const { normalized, parseIssues, error } = normalizeForLoad(doc, get().baseUrlOverride.trim(), warnings);
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
      lastLoadError: error,
      toast: error ?? get().toast,
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
    const parsed = parseAnyMap(raw);
    if (parsed.ok) {
      get().loadDocument(parsed.document, parsed.warnings);
      return true;
    }
    const message = parsed.message;
    // Ошибка — в баннере; всплывающее сообщение её не дублирует
    set({ lastLoadError: message });
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
    if (doc === null) {
      set(baseCheckWithoutMap(url.trim(), get().parseIssues));
      return;
    }
    const kept = get().parseIssues.filter((d) => d.code !== 'INVALID_BASE_URL');
    get().loadDocument(doc, kept);
  },

  setLastLoadError: (lastLoadError) => set({ lastLoadError }),
});
