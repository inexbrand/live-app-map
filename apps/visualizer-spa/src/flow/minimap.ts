/**
 * Мини-карта: размер по пропорциям раскладки и цвета нод.
 *
 * React Flow считает масштаб мини-карты (и перетаскивания по ней) от
 * `style.width/height` компонента MiniMap — размер задаётся только там,
 * а не CSS: иначе SVG и контейнер расходятся и мини-карта обрезана.
 */

/** Прямоугольник ноды в координатах холста. */
export type FlowRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Размер мини-карты, px. */
export type MinimapSize = { readonly width: number; readonly height: number };

/** Наибольший размер мини-карты, px: не наезжает на зум и кнопку журнала. */
export const MINIMAP_MAX: MinimapSize = { width: 240, height: 180 };

/** Наименьшая сторона, px: в такую полосу ещё попадает курсор. */
export const MINIMAP_MIN_SIDE = 56;

/** Цвета экранов по группам: приглушённые, различимые на тёмном фоне. */
export const MINIMAP_GROUP_COLORS: readonly string[] = ['#7ea6d8', '#8cc48a', '#d8a77e', '#b48ad8', '#d2c67a', '#7cc8bf'];

/** Цвет сервиса бэкенда и выбранного экрана. */
export const MINIMAP_SERVICE_COLOR = '#8a8a8a';
export const MINIMAP_SELECTED_COLOR = 'var(--foreground)';

/**
 * Общие границы прямоугольников.
 *
 * @param rects - ноды холста
 * @returns границы; null — нод нет
 */
export function layoutBounds(rects: readonly FlowRect[]): FlowRect | null {
  if (rects.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.width);
    bottom = Math.max(bottom, r.y + r.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Размер мини-карты: пропорции раскладки, вписанные в {@link MINIMAP_MAX};
 * узкая сторона не меньше {@link MINIMAP_MIN_SIDE}.
 *
 * @param bounds - границы раскладки (null — пустая карта)
 */
export function minimapSize(bounds: FlowRect | null): MinimapSize {
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) {
    return MINIMAP_MAX;
  }
  const scale = Math.min(MINIMAP_MAX.width / bounds.width, MINIMAP_MAX.height / bounds.height);
  return {
    width: Math.max(MINIMAP_MIN_SIDE, Math.round(bounds.width * scale)),
    height: Math.max(MINIMAP_MIN_SIDE, Math.round(bounds.height * scale)),
  };
}

/** Что мини-карте нужно знать о ноде для цвета. */
export type MinimapNodeKind =
  | { readonly kind: 'frame' }
  | { readonly kind: 'service' }
  | { readonly kind: 'page'; readonly group: string | undefined; readonly selected: boolean };

/**
 * Заливка ноды: рамка группы — без заливки (только контур), экран — цвет
 * группы по её порядку в карте, выбранный экран — белый.
 *
 * @param node - вид ноды
 * @param groupOrder - id групп карты по порядку
 */
export function minimapFill(node: MinimapNodeKind, groupOrder: readonly string[]): string {
  if (node.kind === 'frame') {
    return 'none';
  }
  if (node.kind === 'service') {
    return MINIMAP_SERVICE_COLOR;
  }
  if (node.selected) {
    return MINIMAP_SELECTED_COLOR;
  }
  const at = node.group === undefined ? -1 : groupOrder.indexOf(node.group);
  return MINIMAP_GROUP_COLORS[(at + MINIMAP_GROUP_COLORS.length) % MINIMAP_GROUP_COLORS.length] ?? MINIMAP_SERVICE_COLOR;
}
