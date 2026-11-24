/**
 * Хуки замечаний для оболочки: синхронизация веток с диском и выбор
 * компонента в живых экранах (сообщения пикера страницы).
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { isElementPick, useSnapshotStore } from '../../store/snapshot-store';
import { NODE_IFRAME_ATTR } from '../gateway/use-gateway-frames';
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

function frames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>(`iframe[${NODE_IFRAME_ATTR}]`)];
}

function broadcast(on: boolean): void {
  for (const f of frames()) {
    f.contentWindow?.postMessage({ lam: 'pick', on }, '*');
  }
}

/**
 * Прокрутить живой экран к элементу и мигнуть рамкой.
 *
 * @param pageId - нода
 * @param selector - CSS-селектор элемента
 */
export function flashElement(pageId: string, selector: string): boolean {
  const frame = frames().find((f) => f.getAttribute(NODE_IFRAME_ATTR) === pageId);
  frame?.contentWindow?.postMessage({ lam: 'flash', selector }, '*');
  return frame !== undefined;
}

/** Живой экран, приславший сообщение, и его нода в карте. */
function senderPage(source: MessageEventSource | null): { readonly frame: HTMLIFrameElement; readonly page: AnchorPage } | null {
  const frame = frames().find((f) => f.contentWindow === source);
  const pageId = frame?.getAttribute(NODE_IFRAME_ATTR) ?? null;
  const page = pageId === null ? null : anchorPage(pageId);
  return frame === undefined || page === null ? null : { frame, page };
}

/** Элемент выбран: черновик замечания у элемента и захват снимка вокруг него. */
function startPickedDraft(picked: LamPickedMessage, frame: HTMLIFrameElement, page: AnchorPage): void {
  const viewRect = frameToView(frame.getBoundingClientRect(), Number(frame.getAttribute('width')), picked.client);
  const app = useAppStore.getState();
  const anchor = buildAnchor({ picked, page, ...anchorContext(), code: app.document?.code, projectRoot: app.document?.project.root });
  useCommentsStore.getState().startDraft({ anchor, viewRect, shot: 'pending' });
  useSnapshotStore.getState().beginCapture(padRect(viewRect, 8, { width: window.innerWidth, height: window.innerHeight }));
}

/** Сообщение страницы во время выбора компонента: отмена или выбранный элемент. */
function onPickerMessage(e: MessageEvent): void {
  const snap = useSnapshotStore.getState();
  if (!isElementPick(snap.session)) {
    return;
  }
  if (isLamPickCancelMessage(e.data)) {
    snap.cancel();
    return;
  }
  const from = isLamPickedMessage(e.data) ? senderPage(e.source) : null;
  if (from !== null && isLamPickedMessage(e.data)) {
    startPickedDraft(e.data, from.frame, from.page);
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

  useEffect(() => {
    window.addEventListener('message', onPickerMessage);
    return () => window.removeEventListener('message', onPickerMessage);
  }, []);
}
