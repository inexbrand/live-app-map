/**
 * Хуки замечаний для оболочки: синхронизация веток с диском и выбор
 * компонента в живых экранах (сообщения пикера страницы).
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { isElementPick, useSnapshotStore } from '../../store/snapshot-store';
import { SCREEN_ATTR } from '../../flow/page-node/ScreenView';
import { streamClient } from '../stream/stream-client';
import { isLamPickCancelMessage, isLamPickedMessage, type LamPickedMessage } from '../gateway/pick-script';
import { buildAnchor, frameToView, padRect, type AnchorPage } from './build-anchor';
import { anchorContext, anchorPage } from './page-anchor';

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

/** Включить или выключить пикер во всех открытых страницах. */
function broadcast(on: boolean): void {
  for (const id of useAppStore.getState().mountedPageIds) {
    streamClient.post(id, { lam: 'pick', on });
  }
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

/** Экран, приславший сообщение, и его нода в карте. */
function senderPage(pageId: string): { readonly frame: HTMLCanvasElement; readonly page: AnchorPage } | null {
  const frame = screenOf(pageId);
  const page = anchorPage(pageId);
  return frame === null || page === null ? null : { frame, page };
}

/** Элемент выбран: черновик замечания у элемента и захват снимка вокруг него. */
function startPickedDraft(picked: LamPickedMessage, frame: HTMLCanvasElement, page: AnchorPage): void {
  const viewRect = frameToView(frame.getBoundingClientRect(), frame.width, picked.client);
  const app = useAppStore.getState();
  const anchor = buildAnchor({ picked, page, ...anchorContext(), code: app.document?.code, projectRoot: app.document?.project.root });
  useCommentsStore.getState().startDraft({ anchor, viewRect, shot: 'pending' });
  useSnapshotStore.getState().beginCapture(padRect(viewRect, 8, { width: window.innerWidth, height: window.innerHeight }));
}

/** Сообщение страницы во время выбора компонента: отмена или выбранный элемент. */
function onPickerMessage(pageId: string, data: unknown): void {
  const snap = useSnapshotStore.getState();
  if (!isElementPick(snap.session)) {
    return;
  }
  if (isLamPickCancelMessage(data)) {
    snap.cancel();
    return;
  }
  const from = isLamPickedMessage(data) ? senderPage(pageId) : null;
  if (from !== null && isLamPickedMessage(data)) {
    startPickedDraft(data, from.frame, from.page);
  }
}

/** Выбор компонента: включает пикер в страницах и принимает выбор. */
export function useCommentPicker(): void {
  const picking = useSnapshotStore((s) => isElementPick(s.session));

  useEffect(() => {
    if (!picking) {
      return;
    }
    broadcast(true);
    // Ноды, смонтированные во время выбора, тоже должны включиться
    const t = window.setInterval(() => broadcast(true), 700);
    return () => {
      window.clearInterval(t);
      broadcast(false);
    };
  }, [picking]);

  useEffect(() => streamClient.onPageMessage(onPickerMessage), []);
}
