/**
 * Геометрия снимка: выделенная мышью область → кадр видео вкладки.
 */

/** Точка в CSS px окна. */
export type Point = { readonly x: number; readonly y: number };

/** Прямоугольник в CSS px окна. */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Размер (окна или кадра видео). */
export type Size = { readonly width: number; readonly height: number };

/** Область исходного кадра для drawImage. */
export type Crop = {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
};

/** Меньше этого по любой стороне — случайный клик, а не выделение. */
export const MIN_SELECTION_PX = 8;

/**
 * Прямоугольник между двумя углами в любом направлении протяжки.
 *
 * @param a - точка нажатия
 * @param b - текущая точка
 */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Выделение достаточно большое, чтобы снимать.
 *
 * @param rect - выделение
 */
export function isUsableSelection(rect: Rect): boolean {
  return rect.width >= MIN_SELECTION_PX && rect.height >= MIN_SELECTION_PX;
}

/**
 * Переводит область окна в пиксели кадра захвата.
 * Кадр вкладки обычно в device px (retina ×2), поэтому масштаб считается
 * отдельно по осям; область обрезается по границам кадра.
 *
 * @param rect - область в CSS px
 * @param viewport - размер окна в CSS px (innerWidth × innerHeight)
 * @param frame - размер кадра видео (videoWidth × videoHeight)
 * @returns область кадра или null, если она вне кадра
 */
export function cropForFrame(rect: Rect, viewport: Size, frame: Size): Crop | null {
  if (viewport.width <= 0 || viewport.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const kx = frame.width / viewport.width;
  const ky = frame.height / viewport.height;
  const x0 = Math.max(0, Math.round(rect.x * kx));
  const y0 = Math.max(0, Math.round(rect.y * ky));
  const x1 = Math.min(frame.width, Math.round((rect.x + rect.width) * kx));
  const y1 = Math.min(frame.height, Math.round((rect.y + rect.height) * ky));
  if (x1 - x0 < 1 || y1 - y0 < 1) {
    return null;
  }
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
}
