/**
 * Zustand store visualizer SPA: срезы по видам (store/app/*) в одном store.
 *
 * Контракт live URL: `resolveLiveUrl(id)` читает document, index, activeStates,
 * globalRole, baseUrlOverride. В React-компонентах подписывайтесь на *результат*
 * селектора `s => s.resolveLiveUrl(id)`, а не на ссылку метода — иначе смена
 * роли/стейта не перерисует iframe и drawer.
 */
import { DEFAULT_MAX_LIVE, DEFAULT_MAX_PINNED, DEFAULT_MAX_WARM } from '@live-app-map/iframe-policy';
import type { LiveAppMapDocument } from '@live-app-map/schema';
import { create } from 'zustand';
import { createDogfoodSlice } from './app/dogfood-slice';
import { createLiveSlice } from './app/live-slice';
import { createLogSlice } from './app/log-slice';
import { createMapSlice } from './app/map-slice';
import { createSelectionSlice } from './app/selection-slice';
import type { AppStore } from './app/types';
import { createViewportSlice } from './app/viewport-slice';

export { countAbsolutePageHosts } from './app/base-url';
export type { ActiveStateSel, AppLogEntry, AppStore, IframeScale } from './app/types';

/** Store визуализатора. */
export const useAppStore = create<AppStore>((...a) => ({
  ...createMapSlice(...a),
  ...createSelectionSlice(...a),
  ...createLiveSlice(...a),
  ...createViewportSlice(...a),
  ...createLogSlice(...a),
  ...createDogfoodSlice(...a),
}));

export { DEFAULT_MAX_PINNED, DEFAULT_MAX_LIVE, DEFAULT_MAX_WARM };
export type { LiveAppMapDocument };
