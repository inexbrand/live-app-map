/**
 * Синхронизация места с адресом страницы: одно направление пишет (store → history),
 * второе только читает (адрес → store при загрузке карты и на «назад/вперёд»).
 */
import { useEffect } from 'react';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { navFromSearch, searchWithNav, type NavState } from './nav-location';

/** Текущее место из двух store. */
function currentNav(): NavState {
  const v = useViewStore.getState();
  return {
    view: v.view,
    route: v.route,
    table: v.table,
    doc: v.doc,
    screen: useAppStore.getState().selectedPageId,
    docsMode: v.docsMode,
  };
}

/** Применяет место из адреса; экран — только если он есть в карте. */
function applyFromLocation(): void {
  const nav = navFromSearch(window.location.search);
  useViewStore.getState().applyNav(nav);
  const app = useAppStore.getState();
  const known = nav.screen !== null && app.document?.nodes.some((n) => n.id === nav.screen) === true;
  if (known || (nav.screen === null && app.selectedPageId !== null)) {
    app.selectPage(nav.screen);
  }
}

/**
 * Держит адрес в согласии с местом. Смена экрана на холсте заменяет запись истории,
 * остальное (вид, роут, таблица, документ) добавляет новую — «назад» возвращает туда.
 */
export function useNavHistory(): void {
  const hasMap = useAppStore((s) => s.document !== null);

  useEffect(() => {
    if (!hasMap) {
      return;
    }
    let applying = true;
    applyFromLocation();
    applying = false;

    const write = (): void => {
      if (applying) {
        return;
      }
      const { search, pathname, hash } = window.location;
      const next = searchWithNav(currentNav(), search);
      if (next === search || (next === '' && search === '')) {
        return;
      }
      const before = navFromSearch(search);
      const after = navFromSearch(next);
      const onlyScreen = before.view === 'screens' && after.view === 'screens';
      const url = `${pathname}${next}${hash}`;
      if (onlyScreen) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    };
    const onPop = (): void => {
      applying = true;
      applyFromLocation();
      applying = false;
    };
    const offView = useViewStore.subscribe(write);
    const offApp = useAppStore.subscribe((s, prev) => {
      if (s.selectedPageId !== prev.selectedPageId) {
        write();
      }
    });
    window.addEventListener('popstate', onPop);
    return () => {
      offView();
      offApp();
      window.removeEventListener('popstate', onPop);
    };
  }, [hasMap]);
}
