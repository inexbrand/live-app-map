/**
 * Переход к сущности карты из видов «API», «База данных», «Документация»:
 * роут → вид «API», таблица → «База данных», экран → холст с выбранным экраном.
 */
import { useCallback } from 'react';
import type { DocTarget } from '@live-app-map/graph';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';

/** Функция перехода к цели. */
export function useMapNav(): (target: DocTarget) => void {
  const openRoute = useViewStore((s) => s.openRoute);
  const openTable = useViewStore((s) => s.openTable);
  const setView = useViewStore((s) => s.setView);
  const selectPage = useAppStore((s) => s.selectPage);
  return useCallback(
    (target: DocTarget) => {
      switch (target.kind) {
        case 'route':
          openRoute(target.routeId);
          return;
        case 'table':
          openTable(target.table);
          return;
        case 'screen':
          setView('screens');
          selectPage(target.nodeId);
          return;
        case 'file':
          return;
      }
    },
    [openRoute, openTable, setView, selectPage],
  );
}

/** Подпись цели для подсказки. */
export function targetTitle(target: DocTarget): string {
  switch (target.kind) {
    case 'route':
      return 'Открыть роут в виде «API»';
    case 'table':
      return 'Открыть таблицу в «Базе данных»';
    case 'screen':
      return 'Показать экран на холсте';
    case 'file':
      return `${target.file}${target.line === undefined ? '' : `:${target.line}`}`;
  }
}
