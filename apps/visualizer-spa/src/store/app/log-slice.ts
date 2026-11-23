/**
 * Срез журнала: записи и toast. Лог экрана показывает его панель (ScreenStatusLog).
 */
import type { AppLogEntry, AppSlice, LogSlice } from './types';

const MAX_LOGS = 400;

/** Срез журнала. */
export const createLogSlice: AppSlice<LogSlice> = (set, get) => ({
  logs: [],
  toast: null,

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

  setToast: (toast) => set({ toast }),
});
