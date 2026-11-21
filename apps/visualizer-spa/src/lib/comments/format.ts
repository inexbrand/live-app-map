/**
 * Подписи и раскладка замечаний: относительное время, место поля у элемента.
 */
import type { Rect } from '../snapshot/region';

/**
 * «только что», «5 мин назад», «3 ч назад», иначе дата.
 *
 * @param iso - время события
 * @param now - текущее время
 */
export function timeAgo(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  if (!(ms >= 0) || ms < 60_000) {
    return 'только что';
  }
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)} мин назад`;
  }
  if (ms < 86_400_000) {
    return `${Math.floor(ms / 3_600_000)} ч назад`;
  }
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Где поставить поле замечания: справа от элемента, иначе слева, иначе
 * под ним; всегда в пределах окна с полями 12 px.
 *
 * @param rect - рамка элемента в окне
 * @param view - размер окна
 * @param size - размер поля
 */
export function composerPosition(rect: Rect, view: { readonly width: number; readonly height: number }, size: { readonly width: number; readonly height: number }): { readonly left: number; readonly top: number } {
  const gap = 12;
  const clampTop = (t: number): number => Math.max(gap, Math.min(view.height - size.height - gap, t));
  const clampLeft = (l: number): number => Math.max(gap, Math.min(view.width - size.width - gap, l));
  if (rect.x + rect.width + gap + size.width + gap <= view.width) {
    return { left: rect.x + rect.width + gap, top: clampTop(rect.y) };
  }
  if (rect.x - gap - size.width >= gap) {
    return { left: rect.x - gap - size.width, top: clampTop(rect.y) };
  }
  const below = rect.y + rect.height + gap;
  return { left: clampLeft(rect.x), top: below + size.height + gap <= view.height ? below : clampTop(rect.y - gap - size.height) };
}

/**
 * Подпись числа замечаний: «1 замечание», «3 замечания», «5 замечаний».
 *
 * @param n - число
 */
export function commentsLabel(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  const word = d10 === 1 && d100 !== 11 ? 'замечание' : d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14) ? 'замечания' : 'замечаний';
  return `${n} ${word}`;
}

/**
 * Короткая цитата текста элемента: не длиннее max, обрезка по слову с «…».
 *
 * @param text - текст элемента
 * @param max - предел символов
 */
export function quoteText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
