/**
 * Бюджет живых iframe: лимиты и раскладка экранов на live, warm и смонтированные.
 */
import { neighbors } from '@live-app-map/graph';
import { DEFAULT_MAX_LIVE, DEFAULT_MAX_PINNED, DEFAULT_MAX_WARM, reconcile, reconcileWarmPool } from '@live-app-map/iframe-policy';
import type { LiveSlice, MapSlice, SelectionSlice } from './types';

/** 9999 = «без лимита» в UI и policy. */
export const MAX_LIVE_IFRAMES_CAP = 9999;

/** Лимит iframe: не число — по умолчанию; 0 или меньше, 9999 и больше — без лимита (9999); иначе округлённое. */
function clampIframeBudget(n: number, fallback: number): number {
  if (!Number.isFinite(n)) {
    return fallback;
  }
  const rounded = Math.round(n);
  return rounded <= 0 || rounded >= MAX_LIVE_IFRAMES_CAP ? MAX_LIVE_IFRAMES_CAP : rounded;
}

/** Лимит живых iframe; 0 — без лимита. */
export function clampMaxLive(n: number): number {
  return clampIframeBudget(n, DEFAULT_MAX_LIVE);
}

/** Лимит warm iframe; 0 и меньше — ни одного (в настройках «0 — сразу unmount»). */
export function clampMaxWarm(n: number): number {
  return Number.isFinite(n) && Math.round(n) <= 0 ? 0 : clampIframeBudget(n, DEFAULT_MAX_WARM);
}

/** Раскладка iframe. */
export type LiveSets = Pick<LiveSlice, 'livePageIds' | 'warmPageIds' | 'warmLruOrder' | 'mountedPageIds'>;

/** Что нужно для раскладки. */
export type LiveBudgetInput = Pick<MapSlice, 'document' | 'index'> &
  Pick<SelectionSlice, 'selectedPageId'> &
  Pick<
    LiveSlice,
    'mode' | 'maxLiveIframes' | 'maxWarmIframes' | 'pinnedPageIds' | 'visiblePageIds' | 'livePageIds' | 'warmPageIds' | 'warmLruOrder' | 'resolveLiveUrl'
  >;

/** Раскладка и закреплённые экраны, которым не хватило бюджета. */
export type LiveBudget = { readonly sets: LiveSets; readonly deferredPins: readonly string[] };

/**
 * Какие экраны живут, какие на паузе в DOM.
 *
 * @param s - состояние store
 */
export function computeLiveBudget(s: LiveBudgetInput): LiveBudget {
  if (!s.document) {
    return { sets: { livePageIds: new Set(), warmPageIds: new Set(), warmLruOrder: [], mountedPageIds: new Set() }, deferredPins: [] };
  }
  const candidates = s.document.nodes.filter((n) => n.kind === 'page' || n.kind === 'not-found').map((n) => n.id);
  const iframeAllowed: Record<string, boolean> = Object.fromEntries(
    s.document.nodes.map((n) => [n.id, n.iframePolicy?.enabled !== false && Boolean(s.resolveLiveUrl(n.id))]),
  );
  const result = reconcile({
    mode: s.mode,
    maxLiveIframes: s.maxLiveIframes,
    maxPinned: DEFAULT_MAX_PINNED,
    candidates,
    pinned: s.pinnedPageIds,
    visible: s.visiblePageIds,
    selected: s.selectedPageId,
    prefetch: prefetchOf(s),
    iframeAllowed,
    recentLiveScore: recentLiveScoreOf(s),
  });
  const warm = reconcileWarmPool({
    liveIds: result.liveIds,
    previousLiveIds: s.livePageIds,
    previousWarmOrder: s.warmLruOrder,
    pinned: s.pinnedPageIds,
    maxWarm: s.maxWarmIframes,
    iframeAllowed,
  });
  return {
    sets: {
      livePageIds: result.liveIds,
      warmPageIds: warm.warmIds,
      warmLruOrder: warm.warmOrder,
      mountedPageIds: warm.mountedIds,
    },
    deferredPins: result.deferredPins,
  };
}

/** Prefetch 1-hop соседей selected — прогрев без pin. */
function prefetchOf(s: LiveBudgetInput): Set<string> {
  return new Set(s.selectedPageId !== null && s.index !== null ? neighbors(s.index, s.selectedPageId) : []);
}

/** Hysteresis: уже LIVE чуть приоритетнее — меньше thrash при pan. */
function recentLiveScoreOf(s: LiveBudgetInput): Record<string, number> {
  const score: Record<string, number> = {};
  for (const id of s.livePageIds) {
    score[id] = 5;
  }
  for (const id of s.warmPageIds) {
    score[id] = Math.max(score[id] ?? 0, 2);
  }
  return score;
}
