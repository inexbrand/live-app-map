/**
 * Где показать окно замечания и плашку фокуса относительно экрана на холсте и
 * какую часть кадра вырезать в снимок компонента. Чистые функции: рамки берёт
 * вызывающий (getBoundingClientRect), здесь только арифметика.
 */
import type { PageFrame } from '../../store/comments-store';
import type { Rect, Size } from '../snapshot/region';

/** Рамка в окне вкладки. */
export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/** Отступ окна от экрана. */
export const POPOVER_GAP = 16;
/** Поле до края вкладки. */
export const EDGE = 12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Место окна замечания: справа от экрана на уровне элемента, не влезает — слева,
 * иначе у правого края поверх. null — элемент (или экран) ушёл из кадра.
 *
 * @param screen - рамка экрана ноды во вкладке
 * @param frame - элемент на странице; null — экран целиком
 * @param view - размер вкладки
 * @param size - размер окна
 */
export function popoverPlace(screen: Box, frame: PageFrame | null, view: Size, size: Size): { readonly left: number; readonly top: number } | null {
  const k = frame === null ? 1 : screen.width / frame.pageWidth;
  const top = frame === null ? screen.top : screen.top + frame.rect.y * k;
  const bottom = frame === null ? screen.top + screen.height : top + frame.rect.height * k;
  const offScreen = bottom < 0 || top > view.height || screen.left + screen.width < 0 || screen.left > view.width;
  if (offScreen) {
    return null;
  }
  const right = screen.left + screen.width + POPOVER_GAP;
  const leftSide = screen.left - POPOVER_GAP - size.width;
  const left = right + size.width <= view.width - EDGE ? right : leftSide >= EDGE ? leftSide : view.width - EDGE - size.width;
  return { left, top: clamp(top, EDGE, Math.max(EDGE, view.height - size.height - EDGE)) };
}

/**
 * Место плашки фокуса: по центру под экраном, у нижнего края вкладки — не ниже него.
 *
 * @param screen - рамка экрана ноды во вкладке
 * @param view - размер вкладки
 * @param size - размер плашки
 */
export function barPlace(screen: Box, view: Size, size: Size): { readonly left: number; readonly top: number } {
  const left = clamp(screen.left + screen.width / 2 - size.width / 2, EDGE, Math.max(EDGE, view.width - size.width - EDGE));
  return { left, top: clamp(screen.top + screen.height + EDGE, EDGE, Math.max(EDGE, view.height - size.height - EDGE)) };
}

/**
 * Часть кадра для снимка: элемент с полем, обрезанная окном страницы.
 * null — от элемента в кадре ничего не осталось.
 *
 * @param rect - элемент в окне страницы, CSS px (= пиксели кадра)
 * @param page - размер кадра
 * @param pad - поле вокруг
 */
export function shotRect(rect: Rect, page: Size, pad: number): Rect | null {
  const x = clamp(Math.floor(rect.x - pad), 0, page.width);
  const y = clamp(Math.floor(rect.y - pad), 0, page.height);
  const width = clamp(Math.ceil(rect.x + rect.width + pad), 0, page.width) - x;
  const height = clamp(Math.ceil(rect.y + rect.height + pad), 0, page.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * Снимок элемента с холста трансляции (кадр в масштабе 1:1 к CSS px страницы).
 * null — холст без 2d или элемент вне кадра.
 *
 * @param canvas - холст экрана
 * @param rect - элемент в окне страницы
 */
export function canvasShot(canvas: HTMLCanvasElement, rect: Rect): string | null {
  const r = shotRect(rect, { width: canvas.width, height: canvas.height }, 8);
  const out = r === null ? null : document.createElement('canvas');
  const g = out?.getContext('2d') ?? null;
  if (r === null || out === null || g === null) {
    return null;
  }
  out.width = r.width;
  out.height = r.height;
  g.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return out.toDataURL('image/png');
}
