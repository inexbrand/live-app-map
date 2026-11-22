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

/** Экран из адреса выбирается, если он есть в карте; пустой — снимает выбор. */
function screenToSelect(screen: string | null): { readonly select: boolean } {
  const app = useAppStore.getState();
  if (screen === null) {
    return { select: app.selectedPageId !== null };
  }
  return { select: app.document?.nodes.some((n) => n.id === screen) === true };
}

/** Применяет место из адреса; экран — только если он есть в карте. */
function applyFromLocation(): void {
  const nav = navFromSearch(window.location.search);
  useViewStore.getState().applyNav(nav);
  if (screenToSelect(nav.screen).select) {
    useAppStore.getState().selectPage(nav.screen);
  }
}

/** Место → адрес: смена только экрана заменяет запись истории, остальное добавляет. */
function writeLocation(): void {
  const { search, pathname, hash } = window.location;
  const next = searchWithNav(currentNav(), search);
  if (next === search) {
    return;
  }
  const onlyScreen = navFromSearch(search).view === 'screens' && navFromSearch(next).view === 'screens';
  const url = `${pathname}${next}${hash}`;
  if (onlyScreen) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}

/** Подписки на место и «назад/вперёд»; возвращает отписку. */
function syncLocation(): () => void {
  let applying = true;
  applyFromLocation();
  applying = false;
  const write = (): void => {
    if (!applying) {
      writeLocation();
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
}

/**
 * Держит адрес в согласии с местом. Смена экрана на холсте заменяет запись истории,
 * остальное (вид, роут, таблица, документ) добавляет новую — «назад» возвращает туда.
 */
export function useNavHistory(): void {
  const hasMap = useAppStore((s) => s.document !== null);
  useEffect(() => (hasMap ? syncLocation() : undefined), [hasMap]);
}
