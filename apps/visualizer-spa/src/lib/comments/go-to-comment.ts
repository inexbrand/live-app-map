/**
 * Переход к замечанию или черновику: экран в фокус, окно у компонента, рамка
 * вокруг элемента в живом экране.
 */
import type { CommentAnchor, CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore, type PageFrame } from '../../store/comments-store';
import { useViewStore } from '../../store/view-store';
import { flashElement } from './use-comments';

/** Место элемента по привязке: рамка в документе страницы и её ширина. */
function frameOf(anchor: CommentAnchor): PageFrame | null {
  const el = anchor.element;
  return el === null || el.rect.width === 0 ? null : { rect: el.rect, pageWidth: el.viewport.width };
}

/** Мигнуть рамкой: страница открывается после перехода камеры — несколько попыток. */
function flashSoon(pageId: string, selector: string): void {
  let tries = 0;
  const tick = (): void => {
    tries++;
    if (!flashElement(pageId, selector) && tries < 8) {
      window.setTimeout(tick, 500);
    }
  };
  window.setTimeout(tick, 600);
}

/**
 * Открыть цель: экран в фокус, окно замечания у элемента.
 *
 * @param anchor - привязка
 * @param frame - место элемента (null — экран целиком или неизвестно)
 */
export function openAnchor(anchor: CommentAnchor, frame: PageFrame | null): void {
  useViewStore.getState().setView('screens');
  useAppStore.getState().selectPage(anchor.pageId);
  useCommentsStore.getState().openTarget({ anchor, frame, shot: null });
  const el = anchor.element;
  if (el !== null && el.rect.width > 0) {
    flashSoon(anchor.pageId, el.selector);
  }
}

/**
 * Перейти к замечанию: лист закрывается, экран в фокус, окно с историей компонента.
 *
 * @param t - замечание
 */
export function goToComment(t: CommentThread): void {
  const comments = useCommentsStore.getState();
  comments.closeSheet();
  comments.focus(t.id);
  openAnchor(t.anchor, frameOf(t.anchor));
}
