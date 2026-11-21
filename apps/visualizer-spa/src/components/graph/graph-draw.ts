/**
 * Рисование графа на canvas: формы узлов по типу, рёбра, подписи, приглушение
 * всего, кроме выбранного узла и его соседей. Цвета — из CSS-переменных темы.
 */
import type { GraphNodeKind } from '../../lib/doc-graph';

/** Узел симуляции. */
export type SimNode = {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly notReady: boolean;
  /** Радиус в мировых координатах. */
  readonly r: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
};

/** Ребро симуляции (после forceLink концы — узлы). */
export type SimLink = {
  source: SimNode | string;
  target: SimNode | string;
  readonly kind: 'contains' | 'links' | 'belongs';
};

/** Камера: экран = мир × k + (x, y). */
export type Camera = { x: number; y: number; k: number };

/** Палитра из темы. */
export type GraphPalette = {
  readonly bg: string;
  readonly node: string;
  readonly nodeMuted: string;
  readonly edge: string;
  readonly edgeStrong: string;
  readonly label: string;
  readonly labelStrong: string;
  readonly attention: string;
  readonly match: string;
};

/** Палитра из CSS-переменных элемента. */
export function readPalette(el: Element): GraphPalette {
  const s = getComputedStyle(el);
  const v = (name: string): string => s.getPropertyValue(name).trim();
  return {
    bg: v('--background'),
    node: v('--graph-node'),
    nodeMuted: v('--graph-node-muted'),
    edge: v('--graph-edge'),
    edgeStrong: v('--graph-edge-strong'),
    label: v('--muted-foreground'),
    labelStrong: v('--foreground'),
    attention: v('--attention'),
    match: v('--foreground'),
  };
}

/** Что подсвечено. */
export type DrawFocus = {
  readonly selected: string | null;
  readonly hovered: string | null;
  /** Выбранный или наведённый узел и его соседи; пусто — подсветки нет. */
  readonly lit: ReadonlySet<string>;
  readonly matches: ReadonlySet<string>;
};

function endId(e: SimNode | string): string {
  return typeof e === 'string' ? e : e.id;
}

/** Контур узла по типу: документы — круги, роуты — ромбы, таблицы и сервисы — квадраты, экраны — прямоугольники. */
function shapePath(ctx: CanvasRenderingContext2D, n: SimNode, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (n.kind) {
    case 'route':
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.25, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.25, y);
      ctx.closePath();
      return;
    case 'table':
    case 'service':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      return;
    case 'screen':
      ctx.rect(x - r * 0.75, y - r * 1.2, r * 1.5, r * 2.4);
      return;
    case 'note':
    case 'guide':
      ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.5);
      return;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** Типы узлов без заливки (только контур). */
function hollow(kind: GraphNodeKind): boolean {
  return kind === 'file' || kind === 'screen' || kind === 'table' || kind === 'service';
}

/**
 * Кадр графа.
 *
 * @param ctx - контекст canvas (уже с учётом devicePixelRatio)
 * @param size - размер в css-пикселях
 * @param nodes - узлы с координатами
 * @param links - рёбра
 * @param cam - камера
 * @param focus - подсветка
 * @param pal - палитра
 * @param labelsAll - подписывать все узлы (локальный граф)
 */
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  size: { readonly w: number; readonly h: number },
  nodes: readonly SimNode[],
  links: readonly SimLink[],
  cam: Camera,
  focus: DrawFocus,
  pal: GraphPalette,
  labelsAll: boolean,
): void {
  ctx.clearRect(0, 0, size.w, size.h);
  const lit = focus.lit;
  const dimming = lit.size > 0;
  const sx = (x: number): number => x * cam.k + cam.x;
  const sy = (y: number): number => y * cam.k + cam.y;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  ctx.lineWidth = 1;
  for (const l of links) {
    const a = typeof l.source === 'string' ? byId.get(l.source) : l.source;
    const b = typeof l.target === 'string' ? byId.get(l.target) : l.target;
    if (a?.x === undefined || a.y === undefined || b?.x === undefined || b.y === undefined) {
      continue;
    }
    const on = dimming && lit.has(endId(l.source)) && lit.has(endId(l.target)) && (focus.selected === endId(l.source) || focus.selected === endId(l.target) || focus.hovered === endId(l.source) || focus.hovered === endId(l.target));
    ctx.globalAlpha = dimming && !on ? 0.12 : 1;
    ctx.strokeStyle = on ? pal.edgeStrong : pal.edge;
    ctx.setLineDash(l.kind === 'belongs' ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(sx(a.x), sy(a.y));
    ctx.lineTo(sx(b.x), sy(b.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const radius = (n: SimNode): number => Math.max(2.5, n.r * Math.min(1.6, Math.max(0.55, cam.k)));
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) {
      continue;
    }
    const x = sx(n.x);
    const y = sy(n.y);
    if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) {
      continue;
    }
    const r = radius(n);
    const on = !dimming || lit.has(n.id);
    ctx.globalAlpha = on ? 1 : 0.18;
    shapePath(ctx, n, x, y, r);
    const strong = n.kind === 'epoch' || n.kind === 'note' || n.kind === 'guide' || n.kind === 'route';
    if (hollow(n.kind)) {
      ctx.fillStyle = pal.bg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = strong ? pal.node : pal.nodeMuted;
      ctx.stroke();
    } else {
      ctx.fillStyle = strong ? pal.node : pal.nodeMuted;
      ctx.fill();
    }
    if (n.notReady && n.kind === 'epoch') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.attention;
      shapePath(ctx, n, x, y, r + 3);
      ctx.stroke();
    }
    if (n.id === focus.selected || focus.matches.has(n.id)) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.match;
      shapePath(ctx, n, x, y, r + (n.id === focus.selected ? 6 : 4));
      ctx.stroke();
    }
  }

  ctx.font = '12px "Medeo Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Подписи по важности: выбранная и наведённая, подсвеченные, найденные, крупные узлы.
  // Подпись, которая легла бы на уже поставленную, пропускается — текст не слипается.
  const priority = (n: SimNode): number =>
    (n.id === focus.selected || n.id === focus.hovered ? 1000 : 0) + (lit.has(n.id) ? 500 : 0) + (focus.matches.has(n.id) ? 300 : 0) + n.r;
  const candidates = nodes
    .filter((n) => {
      const big = n.kind === 'epoch' || n.kind === 'note' || n.kind === 'guide';
      return labelsAll || lit.has(n.id) || focus.matches.has(n.id) || (big && cam.k > 0.5) || cam.k > 1.3;
    })
    .sort((a, b) => priority(b) - priority(a));
  const placed = new LabelGrid();
  for (const n of candidates) {
    if (n.x === undefined || n.y === undefined) {
      continue;
    }
    const x = sx(n.x);
    const y = sy(n.y) + radius(n) + 6;
    if (x < -100 || y < -40 || x > size.w + 100 || y > size.h + 40) {
      continue;
    }
    const text = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
    const w = ctx.measureText(text).width;
    const box = { x: x - w / 2 - 2, y: y - 1, w: w + 4, h: 16 };
    if (!placed.tryPlace(box)) {
      continue;
    }
    const on = !dimming || lit.has(n.id);
    ctx.globalAlpha = on ? 1 : 0.25;
    // Обводка цветом фона: подпись читается поверх рёбер.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = pal.bg;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = n.id === focus.selected || n.id === focus.hovered ? pal.labelStrong : pal.label;
    ctx.fillText(text, x, y);
  }
  ctx.globalAlpha = 1;
}

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** Сетка занятых мест под подписи: проверка пересечения за O(соседних ячеек). */
class LabelGrid {
  private readonly cells = new Map<string, Box[]>();
  private static readonly CELL = 64;

  private keys(b: Box): string[] {
    const c = LabelGrid.CELL;
    const out: string[] = [];
    for (let gx = Math.floor(b.x / c); gx <= Math.floor((b.x + b.w) / c); gx++) {
      for (let gy = Math.floor(b.y / c); gy <= Math.floor((b.y + b.h) / c); gy++) {
        out.push(`${gx}:${gy}`);
      }
    }
    return out;
  }

  /** Ставит подпись, если место свободно. */
  tryPlace(b: Box): boolean {
    const keys = this.keys(b);
    for (const k of keys) {
      for (const o of this.cells.get(k) ?? []) {
        if (b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h) {
          return false;
        }
      }
    }
    for (const k of keys) {
      this.cells.set(k, [...(this.cells.get(k) ?? []), b]);
    }
    return true;
  }
}
