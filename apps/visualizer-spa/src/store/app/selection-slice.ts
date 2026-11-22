/**
 * Срез выбора: поиск, выбранный экран и подсветка соседей, роут в фокусе.
 */
import { neighbors } from '@live-app-map/graph';
import type { AppSlice, SelectionSlice } from './types';

/** Срез выбора. */
export const createSelectionSlice: AppSlice<SelectionSlice> = (set, get) => ({
  searchQuery: '',
  selectedPageId: null,
  codeFocusRouteId: null,
  highlightedPageIds: new Set(),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  focusRoute: (serviceId, routeId) => {
    get().selectPage(serviceId);
    set({ codeFocusRouteId: routeId });
  },

  selectPage: (id) => {
    const index = get().index;
    set({ codeFocusRouteId: null });
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
});
