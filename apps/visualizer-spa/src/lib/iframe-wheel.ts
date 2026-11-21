/**
 * Колесо над живым экраном в ноде → сообщение странице в iframe.
 */
import type { LamWheelMessage } from './gateway/inject-script';

/** Высота строки для deltaMode=1 (строки), px. */
const LINE_PX = 16;

/** Что нужно от события колеса. */
export type WheelInput = {
  readonly clientX: number;
  readonly clientY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
};

/** Коробка iframe на экране (с масштабом ноды и холста). */
export type FrameBox = { readonly left: number; readonly top: number; readonly width: number };

/**
 * Сообщение странице: точка под курсором в px страницы и сдвиг колеса.
 * Ctrl/⌘+колесо (и щипок тачпада) — зум холста: сообщения нет.
 *
 * @param e - событие колеса
 * @param frame - коробка iframe на экране
 * @param pageWidth - ширина окна страницы, px
 * @returns сообщение или null — колесо остаётся холсту
 */
export function wheelToPage(e: WheelInput, frame: FrameBox, pageWidth: number): LamWheelMessage | null {
  if (e.ctrlKey || e.metaKey || frame.width <= 0 || pageWidth <= 0) {
    return null;
  }
  const k = pageWidth / frame.width;
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? frame.width * k : 1;
  return {
    lam: 'wheel',
    x: Math.round((e.clientX - frame.left) * k),
    y: Math.round((e.clientY - frame.top) * k),
    dx: e.deltaX * unit,
    dy: e.deltaY * unit,
  };
}
