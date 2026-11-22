/**
 * Переход к результату глобального поиска: экран — на холст, роут — в «API»,
 * таблица — в «Базу данных», документ — в текст, файл кода — к его роутам, таблице или экрану.
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import type { SearchTarget } from './global-search';

type View = ReturnType<typeof useViewStore.getState>;
type App = ReturnType<typeof useAppStore.getState>;

/** Перейти к результату поиска. */
function openTarget(t: SearchTarget, view: View, app: App): void {
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
    case 'file':
      openFile(t.file, view, app);
      return;
  }
}

/** Файл кода: его роуты в «API», иначе его таблица, иначе экран из этого файла. */
function openFile(file: string, view: View, app: App): void {
  const code = app.document?.code;
  const route = code?.routes.find((r) => r.location.file === file);
  if (route !== undefined) {
    view.setApiScope(null);
    view.setApiFilter({ query: file });
    view.openRoute(route.id);
    return;
  }
  const table = code?.tables.find((x) => x.location.file === file);
  if (table !== undefined) {
    view.openTable(table.exportName);
    return;
  }
  const screen = screenOfFile(app, file);
  if (screen !== undefined) {
    view.setView('screens');
    app.selectPage(screen.id);
  }
}

/** Экран, исходник которого — этот файл. */
function screenOfFile(app: App, file: string): { readonly id: string } | undefined {
  return app.document?.nodes.find((n) => n.source?.file?.endsWith(file) === true);
}

/** Функция перехода. */
export function useOpenTarget(): (t: SearchTarget) => void {
  return useCallback((t: SearchTarget) => openTarget(t, useViewStore.getState(), useAppStore.getState()), []);
}