/**
 * Рисование графа на canvas: формы узлов по типу, рёбра, подписи, приглушение
 * всего, кроме выбранного узла и его соседей. Цвета — из CSS-переменных темы.
 */
import type { GraphNodeKind } from '../../lib/doc-graph';

/** Часть контекста canvas, которой рисуется граф. */
export type GraphCanvas = Pick<
  CanvasRenderingContext2D,
  | 'globalAlpha'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineJoin'
  | 'clearRect'
  | 'setLineDash'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'rect'
  | 'roundRect'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'strokeText'
  | 'fillText'
> & { measureText(text: string): { readonly width: number } };

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
function shapePath(ctx: GraphCanvas, n: SimNode, x: number, y: number, r: number): void {
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

/** Узлы, которые рисуются основным цветом (остальные — приглушённым). */
function isStrong(kind: GraphNodeKind): boolean {
  return kind === 'epoch' || kind === 'note' || kind === 'guide' || kind === 'route';
}

/** Узел с координатами. */
type Placed = SimNode & { x: number; y: number };

function isPlaced(n: SimNode | undefined): n is Placed {
  return n?.x !== undefined && n.y !== undefined;
}

/** Точка дальше поля от края кадра. */
function outside(x: number, y: number, size: { readonly w: number; readonly h: number }, mx: number, my: number): boolean {
  return x < -mx || y < -my || x > size.w + mx || y > size.h + my;
}

/** Перевод мировых координат в экранные. */
type ToScreen = { readonly sx: (x: number) => number; readonly sy: (y: number) => number };

function toScreen(cam: Camera): ToScreen {
  return { sx: (x) => x * cam.k + cam.x, sy: (y) => y * cam.k + cam.y };
}

/** Радиус узла на экране с учётом масштаба. */
function screenRadius(n: SimNode, cam: Camera): number {
  return Math.max(2.5, n.r * Math.min(1.6, Math.max(0.55, cam.k)));
}

/** Конец ребра — узел. */
function endNode(e: SimNode | string, byId: ReadonlyMap<string, SimNode>): SimNode | undefined {
  return typeof e === 'string' ? byId.get(e) : e;
}

/** Ребро выделено: оба конца подсвечены и один из них выбран или под курсором. */
function edgeLit(l: SimLink, focus: DrawFocus): boolean {
  const a = endId(l.source);
  const b = endId(l.target);
  const lit = focus.lit;
  return lit.size > 0 && lit.has(a) && lit.has(b) && [focus.selected, focus.hovered].some((id) => id === a || id === b);
}

function drawEdges(ctx: GraphCanvas, nodes: readonly SimNode[], links: readonly SimLink[], t: ToScreen, focus: DrawFocus, pal: GraphPalette): void {
  const dimming = focus.lit.size > 0;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  ctx.lineWidth = 1;
  for (const l of links) {
    const a = endNode(l.source, byId);
    const b = endNode(l.target, byId);
    if (!isPlaced(a) || !isPlaced(b)) {
      continue;
    }
    const on = edgeLit(l, focus);
    ctx.globalAlpha = dimming && !on ? 0.12 : 1;
    ctx.strokeStyle = on ? pal.edgeStrong : pal.edge;
    ctx.setLineDash(l.kind === 'belongs' ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(t.sx(a.x), t.sy(a.y));
    ctx.lineTo(t.sx(b.x), t.sy(b.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Заливка или контур узла по типу. */
function paintShape(ctx: GraphCanvas, n: SimNode, pal: GraphPalette): void {
  const color = isStrong(n.kind) ? pal.node : pal.nodeMuted;
  if (hollow(n.kind)) {
    ctx.fillStyle = pal.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Кольца вокруг узла: эпоха не готова; узел выбран или найден. */
function drawRings(ctx: GraphCanvas, n: SimNode, x: number, y: number, r: number, focus: DrawFocus, pal: GraphPalette): void {
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

function drawNodes(ctx: GraphCanvas, size: { readonly w: number; readonly h: number }, nodes: readonly SimNode[], cam: Camera, focus: DrawFocus, pal: GraphPalette): void {
  const t = toScreen(cam);
  const dimming = focus.lit.size > 0;
  for (const n of nodes.filter(isPlaced)) {
    const x = t.sx(n.x);
    const y = t.sy(n.y);
    if (outside(x, y, size, 40, 40)) {
      continue;
    }
    const r = screenRadius(n, cam);
    ctx.globalAlpha = !dimming || focus.lit.has(n.id) ? 1 : 0.18;
    shapePath(ctx, n, x, y, r);
    paintShape(ctx, n, pal);
    drawRings(ctx, n, x, y, r, focus, pal);
  }
}

/** Узлу нужна подпись: все подписываются, он подсвечен или найден, крупный при среднем масштабе, или масштаб крупный. */
function wantsLabel(n: SimNode, focus: DrawFocus, k: number, labelsAll: boolean): boolean {
  const big = n.kind === 'epoch' || n.kind === 'note' || n.kind === 'guide';
  return labelsAll || focus.lit.has(n.id) || focus.matches.has(n.id) || (big && k > 0.5) || k > 1.3;
}

/** Важность подписи: выбранная и наведённая, подсвеченные, найденные, крупные узлы. */
function labelPriority(n: SimNode, focus: DrawFocus): number {
  const pointed = n.id === focus.selected || n.id === focus.hovered;
  return (pointed ? 1000 : 0) + (focus.lit.has(n.id) ? 500 : 0) + (focus.matches.has(n.id) ? 300 : 0) + n.r;
}

/** Текст подписи, обрезанный многоточием. */
function labelText(label: string, labelsAll: boolean): string {
  const max = labelsAll ? 26 : 34;
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** Цвет подписи: выбранная и наведённая — ярче. */
function labelColor(n: SimNode, focus: DrawFocus, pal: GraphPalette): string {
  return n.id === focus.selected || n.id === focus.hovered ? pal.labelStrong : pal.label;
}

function drawLabels(ctx: GraphCanvas, size: { readonly w: number; readonly h: number }, nodes: readonly SimNode[], cam: Camera, focus: DrawFocus, pal: GraphPalette, labelsAll: boolean): void {
  const t = toScreen(cam);
  const dimming = focus.lit.size > 0;
  ctx.font = '12px "Medeo Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Подпись, которая легла бы на уже поставленную, пропускается — текст не слипается.
  const candidates = nodes.filter((n) => wantsLabel(n, focus, cam.k, labelsAll)).sort((a, b) => labelPriority(b, focus) - labelPriority(a, focus));
  const placed = new LabelGrid();
  for (const n of candidates.filter(isPlaced)) {
    const x = t.sx(n.x);
    const y = t.sy(n.y) + screenRadius(n, cam) + 6;
    if (outside(x, y, size, 100, 40)) {
      continue;
    }
    const text = labelText(n.label, labelsAll);
    const w = ctx.measureText(text).width;
    if (!placed.tryPlace({ x: x - w / 2 - 2, y: y - 1, w: w + 4, h: 16 })) {
      continue;
    }
    ctx.globalAlpha = !dimming || focus.lit.has(n.id) ? 1 : 0.25;
    // Обводка цветом фона: подпись читается поверх рёбер.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = pal.bg;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = labelColor(n, focus, pal);
    ctx.fillText(text, x, y);
  }
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
  ctx: GraphCanvas,
  size: { readonly w: number; readonly h: number },
  nodes: readonly SimNode[],
  links: readonly SimLink[],
  cam: Camera,
  focus: DrawFocus,
  pal: GraphPalette,
  labelsAll: boolean,
): void {
  ctx.clearRect(0, 0, size.w, size.h);
  drawEdges(ctx, nodes, links, toScreen(cam), focus, pal);
  drawNodes(ctx, size, nodes, cam, focus, pal);
  drawLabels(ctx, size, nodes, cam, focus, pal, labelsAll);
  ctx.globalAlpha = 1;
}

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

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
    if (keys.some((k) => (this.cells.get(k) ?? []).some((o) => overlaps(b, o)))) {
      return false;
    }
    for (const k of keys) {
      this.cells.set(k, [...(this.cells.get(k) ?? []), b]);
    }
    return true;
  }
}
