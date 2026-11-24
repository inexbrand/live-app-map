/**
 * Хуки замечаний для оболочки: синхронизация веток с диском и выбор
 * компонента в выбранном экране (сообщения пикера страницы через трансляцию).
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { useViewStore } from '../../store/view-store';
import { SCREEN_ATTR } from '../../flow/page-node/ScreenView';
import { streamClient } from '../stream/stream-client';
import { isLamPickCancelMessage, isLamPickedMessage, type LamPickedMessage } from '../gateway/pick-script';
import { buildAnchor, type AnchorPage } from './build-anchor';
import { canvasShot } from './place';
import { anchorContext, anchorPage } from './page-anchor';

/** Как часто повторять «включить выбор» выбранному экрану. */
const REPICK_MS = 2000;

/** Поток изменений веток на dev-сервере (запись визуализатора или агента). */
const STREAM_URL = '/api/comments/stream';

/** Держит ветки текущей карты свежими: перечитывает по событию потока, без опроса. */
export function useCommentsSync(): void {
  const mapName = useAppStore((s) => s.document?.project.name ?? null);
  useEffect(() => {
    useCommentsStore.getState().setMapName(mapName);
    if (mapName === null) {
      return;
    }
    // EventSource сам переподключается; ready после подключения догоняет пропущенное
    const source = new EventSource(STREAM_URL);
    const refresh = (): void => void useCommentsStore.getState().refresh();
    source.addEventListener('ready', refresh);
    source.addEventListener('changed', refresh);
    return () => source.close();
  }, [mapName]);
}

/** Холст экрана ноды на карте. */
function screenOf(pageId: string): HTMLCanvasElement | null {
  return [...document.querySelectorAll<HTMLCanvasElement>(`canvas[${SCREEN_ATTR}]`)].find((el) => el.getAttribute(SCREEN_ATTR) === pageId) ?? null;
}

/**
 * Прокрутить живой экран к элементу и мигнуть рамкой.
 *
 * @param pageId - нода
 * @param selector - CSS-селектор элемента
 * @returns страница открыта и получила команду
 */
export function flashElement(pageId: string, selector: string): boolean {
  if (!useAppStore.getState().mountedPageIds.has(pageId)) {
    return false;
  }
  streamClient.post(pageId, { lam: 'flash', selector });
  return true;
}

type AppState = ReturnType<typeof useAppStore.getState>;

/**
 * Экран в режиме выбора компонента: выбранный живой экран на холсте экранов,
 * пока не включена работа с приложением (I).
 *
 * @param s - состояние карты
 * @param onScreens - открыт вид экранов
 */
export function pickPageOf(s: Pick<AppState, 'selectedPageId' | 'interactPageId' | 'mountedPageIds' | 'mode'>, onScreens: boolean): string | null {
  const id = s.selectedPageId;
  return id !== null && onScreens && s.mode === 'live' && s.interactPageId !== id && s.mountedPageIds.has(id) ? id : null;
}

/** Элемент выбран: окно замечания у него, снимок — вырезка из кадра трансляции. */
function openPicked(pageId: string, picked: LamPickedMessage, page: AnchorPage): void {
  const app = useAppStore.getState();
  const anchor = buildAnchor({ picked, page, ...anchorContext(), code: app.document?.code, projectRoot: app.document?.project.root });
  const canvas = screenOf(pageId);
  useCommentsStore.getState().openTarget({
    anchor,
    frame: { rect: picked.client, pageWidth: picked.viewport.width },
    shot: canvas === null ? null : canvasShot(canvas, picked.client),
  });
}

/** Esc в странице: закрыть окно замечания, а без него — выйти из фокуса экрана. */
function cancelPick(): void {
  const comments = useCommentsStore.getState();
  if (comments.target !== null) {
    comments.closeTarget();
    return;
  }
  useAppStore.getState().selectPage(null);
}

/**
 * Ответ страницы, которая сейчас в режиме выбора; после ответа выбор включается
 * снова — следующий компонент того же экрана одним кликом.
 *
 * @param pickPage - экран в режиме выбора
 * @param pageId - кто прислал
 * @param data - сообщение
 */
export function onPickerMessage(pickPage: string | null, pageId: string, data: unknown): void {
  if (pickPage === null || pageId !== pickPage) {
    return;
  }
  if (isLamPickCancelMessage(data)) {
    cancelPick();
  } else if (isLamPickedMessage(data)) {
    const page = anchorPage(pageId);
    if (page !== null) {
      openPicked(pageId, data, page);
    }
  } else {
    return;
  }
  streamClient.post(pageId, { lam: 'pick', on: true });
}

/** Выбор компонента в выбранном экране: включает пикер страницы и принимает выбор. */
export function useCommentPicker(): void {
  const onScreens = useViewStore((s) => s.view === 'screens');
  const pickPage = useAppStore((s) => pickPageOf(s, onScreens));

  useEffect(() => {
    if (pickPage === null) {
      return;
    }
    const on = (): void => streamClient.post(pickPage, { lam: 'pick', on: true });
    on();
    // Сообщение до подключения сокета теряется, а после переподключения страница открыта заново —
    // повтор держит режим выбора (дёшево: одна строка JSON)
    const again = window.setInterval(on, REPICK_MS);
    const off = streamClient.onPageMessage((pageId, data) => onPickerMessage(pickPage, pageId, data));
    return () => {
      window.clearInterval(again);
      off();
      streamClient.post(pickPage, { lam: 'pick', on: false });
    };
  }, [pickPage]);
}
