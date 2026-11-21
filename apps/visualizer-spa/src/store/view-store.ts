/**
 * Какой вид открыт: холст экранов или «База данных».
 */
import { create } from 'zustand';

/** Вид приложения. */
export type AppView = 'screens' | 'database';

type ViewState = {
  readonly view: AppView;
  /** Выбранная таблица вида «База данных» (exportName). */
  readonly table: string | null;
  readonly setView: (view: AppView) => void;
  readonly openTable: (exportName: string) => void;
};

/** Store вида. */
export const useViewStore = create<ViewState>((set) => ({
  view: 'screens',
  table: null,
  setView: (view) => set({ view }),
  openTable: (table) => set({ view: 'database', table }),
}));
