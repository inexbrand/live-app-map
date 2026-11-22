/**
 * Переход к сущности карты из видов «API», «База данных», «Документация»:
 * роут → вид «API», таблица → «База данных», экран → холст с выбранным экраном.
 */
import { useCallback } from 'react';
import { matchDocTarget, type DocTarget } from '@live-app-map/graph';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';

/** Функция перехода к цели. */
export function useMapNav(): (target: DocTarget) => void {
  const openRoute = useViewStore((s) => s.openRoute);
  const openTable = useViewStore((s) => s.openTable);
  const setView = useViewStore((s) => s.setView);
  const selectPage = useAppStore((s) => s.selectPage);
  return useCallback(
    (target: DocTarget) =>
      matchDocTarget(target, {
        route: (t) => openRoute(t.routeId),
        table: (t) => openTable(t.table),
        screen: (t) => {
          setView('screens');
          selectPage(t.nodeId);
        },
        file: () => undefined,
      }),
    [openRoute, openTable, setView, selectPage],
  );
}

/** Подпись цели для подсказки. */
export function targetTitle(target: DocTarget): string {
  return matchDocTarget(target, {
    route: () => 'Открыть роут в виде «API»',
    table: () => 'Открыть таблицу в «Базе данных»',
    screen: () => 'Показать экран на холсте',
    file: (f) => `${f.file}${f.line === undefined ? '' : `:${f.line}`}`,
  });
}
