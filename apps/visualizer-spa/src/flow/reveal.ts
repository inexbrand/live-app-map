/**
 * Сдвиг холста, после которого выбранная нода не лежит под панелями.
 */

/** Прямоугольник на экране, px. */
export type ScreenRect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

/** Панель поверх холста и край экрана, к которому она прижата. */
export type DockedPanel = { readonly rect: ScreenRect; readonly side: 'left' | 'right' | 'top' };

function intersects(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Насколько сдвинуть холст, чтобы нода вышла из-под панелей: по горизонтали —
 * в просвет между левыми и правыми панелями (не влезает — к левому краю
 * просвета), по вертикали — шапкой ниже верхней панели. Не мешают — {0, 0}.
 *
 * @param node - нода на экране
 * @param panels - панели поверх холста
 * @param gap - отступ от панели, px
 */
export function revealShift(node: ScreenRect, panels: readonly DockedPanel[], gap: number): { readonly dx: number; readonly dy: number } {
  const covering = panels.filter((p) => intersects(node, p.rect));
  if (covering.length === 0) {
    return { dx: 0, dy: 0 };
  }
  const edge = (side: DockedPanel['side'], pick: (r: ScreenRect) => number) => covering.filter((p) => p.side === side).map((p) => pick(p.rect));
  const leftEdge = Math.max(-Infinity, ...edge('left', (r) => r.right + gap));
  const rightEdge = Math.min(Infinity, ...edge('right', (r) => r.left - gap));
  const topEdge = Math.max(-Infinity, ...edge('top', (r) => r.bottom + gap));
  let dx = 0;
  if (node.left < leftEdge || node.right - node.left > rightEdge - leftEdge) {
    dx = leftEdge - node.left;
  } else if (node.right > rightEdge) {
    dx = rightEdge - node.right;
  }
  const dy = node.top < topEdge ? topEdge - node.top : 0;
  return { dx: Number.isFinite(dx) ? dx : 0, dy };
}
