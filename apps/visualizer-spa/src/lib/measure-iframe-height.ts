/**
 * Высота контента live iframe для heightMode=auto.
 *
 * Работает только для same-origin кадра (proxy `/__lam_proxy/…`): у
 * cross-origin `contentDocument` равен null, тогда возвращается null и
 * нода остаётся с высотой из JSON.
 *
 * `documentElement.scrollHeight` не используется: он не меньше высоты
 * самого iframe, и нода могла бы только расти. Берётся высота коробок
 * html и body, которые при height:auto равны высоте контента.
 */
import { MAX_CONTENT_HEIGHT } from './viewport';

/** Минимальная осмысленная высота (меньше — документ ещё пустой). */
export const MIN_CONTENT_HEIGHT = 120;

/** Часть документа, нужная для замера (HTMLDocument подходит). */
export type MeasurableDocument = {
  readonly documentElement: { readonly offsetHeight: number } | null;
  readonly body: { readonly scrollHeight: number; readonly offsetHeight: number } | null;
};

/** Часть iframe, нужная для замера (HTMLIFrameElement подходит). */
export type MeasurableFrame = {
  readonly contentDocument: MeasurableDocument | null;
};

function readDocument(frame: MeasurableFrame): MeasurableDocument | null {
  try {
    return frame.contentDocument;
  } catch {
    // Некоторые движки бросают SecurityError вместо null
    return null;
  }
}

/**
 * Высота контента документа iframe в CSS px.
 *
 * @param frame - iframe (или null, если ref ещё не прикреплён)
 * @returns высота, ограниченная MAX_CONTENT_HEIGHT; null — замер невозможен
 */
export function measureIframeContentHeight(frame: MeasurableFrame | null): number | null {
  if (frame === null) {
    return null;
  }
  const doc = readDocument(frame);
  if (doc === null || doc.body === null) {
    return null;
  }
  const height = Math.max(
    doc.documentElement?.offsetHeight ?? 0,
    doc.body.scrollHeight,
    doc.body.offsetHeight,
  );
  if (!Number.isFinite(height) || height < MIN_CONTENT_HEIGHT) {
    return null;
  }
  return Math.min(MAX_CONTENT_HEIGHT, Math.ceil(height));
}
