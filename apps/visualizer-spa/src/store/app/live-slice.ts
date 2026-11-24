/**
 * Срез живых iframe: бюджет, закрепление, видимость, стейты, роль, live URL.
 */
import { DEFAULT_MAX_PINNED, DEFAULT_MAX_WARM } from '@live-app-map/iframe-policy';
import { MAX_LIVE_IFRAMES_CAP, clampMaxLive, clampMaxWarm, computeLiveBudget } from './iframe-budget';
import { resolveLiveUrl } from './live-url';
import type { AppSlice, LiveSlice } from './types';

/** Срез живых iframe. */
export const createLiveSlice: AppSlice<LiveSlice> = (set, get) => ({
  mode: 'live',
  // 50% — ряд экранов читаем без гигантского world
  iframeScale: 0.5,
  // Без лимита числа: живость решает масштаб на мониторе (LIVE_MIN_SCREEN_SCALE).
  maxLiveIframes: MAX_LIVE_IFRAMES_CAP,
  maxWarmIframes: DEFAULT_MAX_WARM,
  pinnedPageIds: new Set(),
  visiblePageIds: new Set(),
  livePageIds: new Set(),
  warmPageIds: new Set(),
  warmLruOrder: [],
  mountedPageIds: new Set(),
  interactPageId: null,
  activeStates: new Map(),
  globalRole: '',
  cameraZoom: 1,

  setMode: () => {
    // Dogfood: только live — map-only/compact не нужны (всегда iframe).
    set({ mode: 'live' });
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

  setCameraZoom: (cameraZoom) => {
    if (cameraZoom === get().cameraZoom) {
      return;
    }
    set({ cameraZoom });
    get().recomputeLive();
  },

  resolveLiveUrl: (id) => resolveLiveUrl(get(), id),

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

  recomputeLive: () => {
    const s = get();
    const { sets, deferredPins } = computeLiveBudget(s);
    if (deferredPins.length > 0) {
      set({
        ...sets,
        toast: `Pin отложен (бюджет iframe ${s.maxLiveIframes}): ${deferredPins.join(', ')}`,
      });
      return;
    }
    set(sets);
  },
});
