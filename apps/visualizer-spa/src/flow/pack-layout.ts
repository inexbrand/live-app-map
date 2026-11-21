/**
 * Раскладка карты без наложений: ноды делятся на группы (поверхности
 * приложения, сервисы бэкенда), внутри группы связные куски раскладываются
 * dagre с настоящими размерами нод, куски и одиночки укладываются полками
 * в ряды ограниченной ширины, группы идут блоками сверху вниз.
 */
import dagre from '@dagrejs/dagre';

/** Нода для раскладки: размер в мировых координатах и группа. */
export type LayoutBox = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly group: string;
};

/** Ребро между нодами. */
export type LayoutLink = { readonly from: string; readonly to: string };

/** Прямоугольник в мировых координатах. */
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Рамка группы с подписью. */
export type GroupFrame = Rect & { readonly id: string; readonly title: string };

/** Итог раскладки. */
export type PackedLayout = {
  /** Левый верхний угол ноды. */
  readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  readonly groups: readonly GroupFrame[];
};

/** Настройки раскладки. */
export type PackOptions = {
  /** Порядок групп сверху вниз; не перечисленные — следом по алфавиту. */
  readonly groupOrder: readonly string[];
  readonly groupTitles: ReadonlyMap<string, string>;
  /** Наибольшая ширина ряда внутри группы. */
  readonly maxRowWidth: number;
};

/** Зазор между нодами и кусками. */
export const NODE_GAP = 48;
/** Зазор между группами. */
export const GROUP_GAP = 160;
/** Поля рамки группы. */
export const GROUP_PAD = 40;
/** Высота шапки группы (подпись). */
export const GROUP_HEADER = 96;

/** Кусок группы: ноды со смещениями от его левого верхнего угла. */
type Piece = { readonly width: number; readonly height: number; readonly items: ReadonlyMap<string, { x: number; y: number }> };

/** Связные компоненты по рёбрам внутри набора нод (порядок — по первой ноде). */
function components(boxes: readonly LayoutBox[], links: readonly LayoutLink[]): LayoutBox[][] {
  const parent = new Map(boxes.map((b) => [b.id, b.id]));
  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      cur = parent.get(cur) ?? cur;
    }
    return cur;
  };
  for (const l of links) {
    if (parent.has(l.from) && parent.has(l.to)) {
      parent.set(find(l.from), find(l.to));
    }
  }
  const out = new Map<string, LayoutBox[]>();
  for (const b of boxes) {
    const root = find(b.id);
    out.set(root, [...(out.get(root) ?? []), b]);
  }
  return [...out.values()];
}

/**
 * Кусок из связной компоненты: dagre LR; длинная цепочка, не влезающая в ряд, —
 * dagre TB; если и так шире ряда — ноды полками в порядке обхода.
 */
function piece(boxes: readonly LayoutBox[], links: readonly LayoutLink[], maxRowWidth: number): Piece {
  const lr = dagrePiece(boxes, links, 'LR');
  if (lr.width <= maxRowWidth) {
    return lr;
  }
  const tb = dagrePiece(boxes, links, 'TB');
  if (tb.width <= maxRowWidth) {
    return tb;
  }
  return shelf(
    boxes.map((b) => ({ width: b.width, height: b.height, items: new Map([[b.id, { x: 0, y: 0 }]]) })),
    maxRowWidth,
  );
}

/** Раскладка компоненты dagre с настоящими размерами. */
function dagrePiece(boxes: readonly LayoutBox[], links: readonly LayoutLink[], rankdir: 'LR' | 'TB'): Piece {
  const first = boxes[0];
  if (boxes.length === 1 && first !== undefined) {
    return { width: first.width, height: first.height, items: new Map([[first.id, { x: 0, y: 0 }]]) };
  }
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep: NODE_GAP, ranksep: NODE_GAP * 2, marginx: 0, marginy: 0 });
  for (const b of boxes) {
    g.setNode(b.id, { width: b.width, height: b.height });
  }
  for (const l of links) {
    if (g.hasNode(l.from) && g.hasNode(l.to) && l.from !== l.to) {
      g.setEdge(l.from, l.to);
    }
  }
  dagre.layout(g);
  const raw = boxes.map((b) => {
    const p = g.node(b.id) as { x: number; y: number };
    return { id: b.id, x: p.x - b.width / 2, y: p.y - b.height / 2, w: b.width, h: b.height };
  });
  const minX = Math.min(...raw.map((r) => r.x));
  const minY = Math.min(...raw.map((r) => r.y));
  return {
    width: Math.max(...raw.map((r) => r.x + r.w)) - minX,
    height: Math.max(...raw.map((r) => r.y + r.h)) - minY,
    items: new Map(raw.map((r) => [r.id, { x: r.x - minX, y: r.y - minY }])),
  };
}

/** Полки: куски слева направо, перенос ряда по ширине. */
function shelf(pieces: readonly Piece[], maxRowWidth: number): Piece {
  const items = new Map<string, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const p of pieces) {
    if (x > 0 && x + p.width > maxRowWidth) {
      x = 0;
      y += rowH + NODE_GAP;
      rowH = 0;
    }
    for (const [id, off] of p.items) {
      items.set(id, { x: x + off.x, y: y + off.y });
    }
    x += p.width + NODE_GAP;
    rowH = Math.max(rowH, p.height);
    width = Math.max(width, x - NODE_GAP);
  }
  return { width, height: y + rowH, items };
}

/**
 * Раскладывает ноды по группам без наложений.
 *
 * @param boxes - ноды с размерами и группой
 * @param links - рёбра (учитываются только внутри группы)
 * @param opts - порядок и подписи групп, ширина ряда
 * @returns позиции нод и рамки групп
 */
export function packLayout(boxes: readonly LayoutBox[], links: readonly LayoutLink[], opts: PackOptions): PackedLayout {
  const byGroup = new Map<string, LayoutBox[]>();
  for (const b of boxes) {
    byGroup.set(b.group, [...(byGroup.get(b.group) ?? []), b]);
  }
  const order = [
    ...opts.groupOrder.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !opts.groupOrder.includes(g)).sort(),
  ];
  const positions = new Map<string, { x: number; y: number }>();
  const groups: GroupFrame[] = [];
  let top = 0;
  for (const groupId of order) {
    const members = byGroup.get(groupId) ?? [];
    const ids = new Set(members.map((m) => m.id));
    const inner = links.filter((l) => ids.has(l.from) && ids.has(l.to));
    // Крупные связные куски первыми, одиночки — следом в исходном порядке.
    const pieces = components(members, inner)
      .map((c) => piece(c, inner, opts.maxRowWidth))
      .sort((a, b) => b.items.size - a.items.size);
    const widest = Math.max(...pieces.map((p) => p.width));
    const packed = shelf(pieces, Math.max(opts.maxRowWidth, widest));
    for (const [id, off] of packed.items) {
      positions.set(id, { x: GROUP_PAD + off.x, y: top + GROUP_HEADER + off.y });
    }
    groups.push({
      id: groupId,
      title: opts.groupTitles.get(groupId) ?? groupId,
      x: 0,
      y: top,
      width: packed.width + GROUP_PAD * 2,
      height: GROUP_HEADER + packed.height + GROUP_PAD,
    });
    top += GROUP_HEADER + packed.height + GROUP_PAD + GROUP_GAP;
  }
  return { positions, groups };
}

/**
 * Пары пересекающихся прямоугольников (касание краями — не пересечение).
 *
 * @param rects - прямоугольники с id
 * @returns пары id
 */
export function findOverlaps(rects: ReadonlyArray<Rect & { readonly id: string }>): Array<[string, string]> {
  const sorted = [...rects].sort((a, b) => a.x - b.x);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b === undefined || b.x >= a.x + a.width) {
        break;
      }
      if (b.y < a.y + a.height && a.y < b.y + b.height) {
        out.push([a.id, b.id]);
      }
    }
  }
  return out;
}

/**
 * Стартовый вид: левый верхний угол первой группы в таком масштабе, чтобы
 * подписи нод читались (не мельче minZoom), а в ширину влезло сколько получится.
 *
 * @param layout - раскладка
 * @param boxes - ноды
 * @param canvas - размер холста в px
 * @param zoomRange - пределы масштаба
 * @returns вид React Flow
 */
export function startViewport(
  layout: PackedLayout,
  boxes: readonly LayoutBox[],
  canvas: { readonly width: number; readonly height: number },
  zoomRange: { readonly min: number; readonly max: number },
): { x: number; y: number; zoom: number } {
  const first = layout.groups[0];
  if (first === undefined) {
    return { x: 0, y: 0, zoom: zoomRange.max };
  }
  // Ширина первой группы, но не больше трёх первых нод верхнего ряда.
  const topRow = boxes
    .filter((b) => b.group === first.id)
    .map((b) => ({ b, p: layout.positions.get(b.id) }))
    .filter((r): r is { b: LayoutBox; p: { x: number; y: number } } => r.p !== undefined && r.p.y === first.y + GROUP_HEADER)
    .sort((a, b) => a.p.x - b.p.x)
    .slice(0, 3);
  const rowRight = topRow.length === 0 ? first.width : Math.max(...topRow.map((r) => r.p.x + r.b.width)) + GROUP_PAD;
  const want = Math.min(rowRight, first.width);
  const zoom = Math.min(zoomRange.max, Math.max(zoomRange.min, canvas.width / want));
  return { x: -first.x * zoom + 16, y: -first.y * zoom + 16, zoom };
}
