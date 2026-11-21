/**
 * Какой вид открыт: холст экранов, «API», «База данных» или «Документация»,
 * и что выбрано в каждом виде. Фильтры вида «API» живут здесь, чтобы переход
 * к таблице и обратно их не сбрасывал.
 */
import { create } from 'zustand';
import type { ApiFilter } from '@live-app-map/graph';
import type { DocsMode, NavState } from '../lib/nav-location';

/** Вид приложения. */
export type AppView = 'screens' | 'api' | 'database' | 'docs';

type ViewState = {
  readonly view: AppView;
  /** Выбранная таблица вида «База данных» (exportName). */
  readonly table: string | null;
  /** Выбранный роут вида «API» (id). */
  readonly route: string | null;
  /** Фильтр вида «API». */
  readonly apiFilter: ApiFilter;
  /** Раздел или модуль дерева «API» (префикс); null — все роуты. */
  readonly apiScope: string | null;
  /** Открытый документ вида «Документация» (путь от корня). */
  readonly doc: string | null;
  /** Документация: текст или граф. */
  readonly docsMode: DocsMode;
  readonly setView: (view: AppView) => void;
  readonly openTable: (exportName: string) => void;
  readonly openRoute: (routeId: string) => void;
  readonly setApiFilter: (filter: ApiFilter) => void;
  readonly setApiScope: (prefix: string | null) => void;
  readonly openDoc: (path: string) => void;
  readonly setDocsMode: (mode: DocsMode) => void;
  /** Применить место из адреса (вид и выбранное; экран — в app-store). */
  readonly applyNav: (nav: NavState) => void;
};

/** Store вида. */
export const useViewStore = create<ViewState>((set) => ({
  view: 'screens',
  table: null,
  route: null,
  apiFilter: {},
  apiScope: null,
  doc: null,
  docsMode: 'text',
  setView: (view) => set({ view }),
  openTable: (table) => set({ view: 'database', table }),
  openRoute: (route) => set({ view: 'api', route }),
  setApiFilter: (apiFilter) => set({ apiFilter }),
  setApiScope: (apiScope) => set({ apiScope }),
  openDoc: (doc) => set({ view: 'docs', doc, docsMode: 'text' }),
  setDocsMode: (docsMode) => set({ view: 'docs', docsMode }),
  applyNav: (nav) =>
    set({
      view: nav.view,
      docsMode: nav.docsMode,
      ...(nav.route === null ? {} : { route: nav.route }),
      ...(nav.table === null ? {} : { table: nav.table }),
      ...(nav.doc === null ? {} : { doc: nav.doc }),
    }),
}));
