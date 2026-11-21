/**
 * Переход к результату глобального поиска: экран — на холст, роут — в «API»,
 * таблица — в «Базу данных», документ — в текст, файл кода — к его роутам, таблице или экрану.
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import type { SearchTarget } from './global-search';

/** Функция перехода. */
export function useOpenTarget(): (t: SearchTarget) => void {
  return useCallback((t: SearchTarget) => {
    const view = useViewStore.getState();
    const app = useAppStore.getState();
    switch (t.kind) {
      case 'screen':
        view.setView('screens');
        app.selectPage(t.nodeId);
        return;
      case 'route':
        view.openRoute(t.routeId);
        return;
      case 'table':
        view.openTable(t.table);
        return;
      case 'doc':
        view.openDoc(t.path);
        return;
      case 'file': {
        const code = app.document?.code;
        const routes = code?.routes.filter((r) => r.location.file === t.file) ?? [];
        if (routes.length > 0) {
          view.setApiScope(null);
          view.setApiFilter({ query: t.file });
          view.openRoute(routes[0]?.id ?? '');
          return;
        }
        const table = code?.tables.find((x) => x.location.file === t.file);
        if (table !== undefined) {
          view.openTable(table.exportName);
          return;
        }
        const screen = app.document?.nodes.find((n) => n.source?.file !== undefined && n.source.file.endsWith(t.file));
        if (screen !== undefined) {
          view.setView('screens');
          app.selectPage(screen.id);
        }
        return;
      }
    }
  }, []);
}
