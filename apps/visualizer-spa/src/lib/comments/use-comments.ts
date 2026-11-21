/**
 * Хуки замечаний для оболочки: синхронизация веток с диском и выбор
 * компонента в живых экранах (сообщения пикера страницы).
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { isElementPick, useSnapshotStore } from '../../store/snapshot-store';
import { NODE_IFRAME_ATTR } from '../gateway/use-gateway-frames';
import { isLamPickCancelMessage, isLamPickedMessage } from '../gateway/pick-script';
import { buildAnchor, frameToView, padRect } from './build-anchor';
import { anchorContext, anchorPage } from './page-anchor';

/** Как часто перечитывать ветки (ответы агента приходят через файлы). */
const POLL_MS = 3000;

/** Держит ветки текущей карты свежими. */
export function useCommentsSync(): void {
  const mapName = useAppStore((s) => s.document?.project.name ?? null);
  useEffect(() => {
    useCommentsStore.getState().setMapName(mapName);
    if (mapName === null) {
      return;
    }
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void useCommentsStore.getState().refresh();
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
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
    const onMessage = (e: MessageEvent): void => {
      const snap = useSnapshotStore.getState();
      if (!isElementPick(snap.session)) {
        return;
      }
      if (isLamPickCancelMessage(e.data)) {
        snap.cancel();
        return;
      }
      if (!isLamPickedMessage(e.data)) {
        return;
      }
      const frame = frames().find((f) => f.contentWindow === e.source);
      const pageId = frame?.getAttribute(NODE_IFRAME_ATTR) ?? null;
      const page = pageId === null ? null : anchorPage(pageId);
      if (frame === undefined || page === null) {
        return;
      }
      const viewRect = frameToView(frame.getBoundingClientRect(), Number(frame.getAttribute('width')), e.data.client);
      const app = useAppStore.getState();
      const anchor = buildAnchor({ picked: e.data, page, ...anchorContext(), code: app.document?.code, screenFile: app.index?.nodesById.get(page.id)?.source?.file });
      useCommentsStore.getState().startDraft({ anchor, viewRect, shot: 'pending' });
      snap.beginCapture(padRect(viewRect, 8, { width: window.innerWidth, height: window.innerHeight }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
