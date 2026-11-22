/**
 * Граф на canvas с раскладкой d3-force: сотни узлов без DOM на каждый узел.
 * Колесо — масштаб под курсором, перетаскивание фона — сдвиг, узла — перенос;
 * клик выбирает узел, двойной клик открывает его. Позиции узлов переживают
 * смену фильтров и раскрытие эпох: новые узлы появляются рядом с соседями.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { NODE_KIND_LABELS, type DocGraph } from '../../lib/doc-graph';
import { graphNeighbors } from '../../lib/doc-graph-query';
import { centeredCamera, fitCamera, nodeAt, toSimNodes, toWorld, zoomAt, type Point } from './graph-camera';
import { drawGraph, readPalette, type Camera, type SimLink, type SimNode } from './graph-draw';

/** Свойства холста графа. */
export type DocGraphCanvasProps = {
  readonly graph: DocGraph;
  readonly selectedId: string | null;
  readonly matches: ReadonlySet<string>;
  readonly onSelect: (id: string | null) => void;
  readonly onOpen: (id: string) => void;
  /** Подписывать все узлы и вписывать граф в рамку (локальный граф). */
  readonly compact?: boolean;
  readonly testId: string;
  /** Подпись для чтения с экрана. */
  readonly ariaLabel: string;
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Жест мышью: сдвиг фона или перенос узла. */
type Drag = { readonly mode: 'pan' | 'node'; readonly node: SimNode | null; x: number; y: number; moved: boolean };

/**
 * Изменяемое состояние холста между кадрами: раскладка, камера, наведение, жест.
 * Живёт вне React — смена не перерисовывает компонент, только кадр canvas.
 */
type CanvasState = {
  sim: Simulation<SimNode, SimLink> | null;
  nodes: SimNode[];
  links: SimLink[];
  /** Позиции узлов, переживающие смену графа. */
  readonly positions: Map<string, { x: number; y: number }>;
  cam: Camera;
  /** Узел, за которым камера следует, пока раскладка двигается; сдвиг или масштаб рукой отпускает его. */
  follow: string | null;
  fitted: boolean;
  hovered: string | null;
  size: { w: number; h: number };
  frame: number;
  focus: { readonly selectedId: string | null; readonly matches: ReadonlySet<string> };
  drag: Drag | null;
  /** Перерисовать в ближайший кадр. */
  draw: () => void;
  handlers: { readonly onSelect: (id: string | null) => void; readonly onOpen: (id: string) => void };
};

function newCanvasState(props: DocGraphCanvasProps): CanvasState {
  return {
    sim: null,
    nodes: [],
    links: [],
    positions: new Map(),
    cam: { x: 0, y: 0, k: 1 },
    follow: null,
    fitted: false,
    hovered: null,
    size: { w: 0, h: 0 },
    frame: 0,
    focus: { selectedId: props.selectedId, matches: props.matches },
    drag: null,
    draw: () => {},
    handlers: { onSelect: props.onSelect, onOpen: props.onOpen },
  };
}

/** Ставит узел в центр холста при текущем масштабе. */
function centerOn(s: CanvasState, id: string): void {
  s.cam = centeredCamera(s.nodes.find((x) => x.id === id), s.cam, s.size);
}

/** Соседи узла с кэшем на граф. */
function useNeighbors(graph: DocGraph): (id: string) => Set<string> {
  return useMemo(() => {
    const cache = new Map<string, Set<string>>();
    return (id: string): Set<string> => {
      const hit = cache.get(id) ?? graphNeighbors(graph, id);
      cache.set(id, hit);
      return hit;
    };
  }, [graph]);
}

/** Кадр: подсветка вокруг наведённого или выбранного узла. */
function drawFrame(canvas: HTMLCanvasElement | null, s: CanvasState, neighborsOf: (id: string) => Set<string>, compact: boolean): void {
  const ctx = canvas === null ? null : canvas.getContext('2d');
  if (canvas === null || ctx === null) {
    return;
  }
  const { selectedId: sel, matches } = s.focus;
  const center = s.hovered ?? sel;
  const lit = center === null ? new Set<string>() : new Set([center, ...neighborsOf(center)]);
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraph(ctx, s.size, s.nodes, s.links, s.cam, { selected: sel, hovered: s.hovered, lit, matches }, readPalette(canvas), compact);
}

/** Размер canvas по контейнеру; в компактном виде или до первой подгонки — камера вписывает граф. */
function resizeCanvas(canvas: HTMLCanvasElement, s: CanvasState, compact: boolean): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  s.size = { w: rect.width, h: rect.height };
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  if (compact || (!s.fitted && rect.width > 0 && s.nodes.length > 0)) {
    s.cam = fitCamera(s.nodes, rect.width, rect.height, compact ? 32 : 48);
    s.fitted = rect.width > 0;
  }
  s.draw();
}

/** Новый узел — рядом с уже размещённым соседом, чтобы раскрытие не взрывало раскладку; возвращает число размещённых раньше. */
function placeNewNodes(nodes: SimNode[], neighborsOf: (id: string) => Set<string>): number {
  const placed = new Map(nodes.filter((n) => n.x !== undefined).map((n) => [n.id, n]));
  for (const n of nodes.filter((x) => x.x === undefined)) {
    const near = [...neighborsOf(n.id)].map((id) => placed.get(id)).find((x) => x !== undefined);
    if (near?.x !== undefined && near.y !== undefined) {
      n.x = near.x + (Math.random() - 0.5) * 30;
      n.y = near.y + (Math.random() - 0.5) * 30;
    }
  }
  return placed.size;
}

/** Силы раскладки. */
function buildSimulation(nodes: SimNode[], links: SimLink[], compact: boolean): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode, SimLink>(nodes)
    .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => (l.kind === 'contains' ? 30 : 70)).strength(0.4))
    .force('charge', forceManyBody<SimNode>().strength(compact ? -140 : -110).distanceMax(compact ? 300 : 520))
    .force('collide', forceCollide<SimNode>((d) => d.r + 4))
    .force('x', forceX<SimNode>(0).strength(0.04))
    .force('y', forceY<SimNode>(0).strength(0.04))
    .stop();
}

/** Запомнить позиции узлов. */
function savePositions(nodes: readonly SimNode[], positions: Map<string, { x: number; y: number }>): void {
  for (const n of nodes) {
    if (n.x !== undefined && n.y !== undefined) {
      positions.set(n.id, { x: n.x, y: n.y });
    }
  }
}

/** Шаг живой раскладки: камера вписывает граф или держит выбранный узел. */
function onLayoutTick(s: CanvasState, nodes: readonly SimNode[], compact: boolean): void {
  savePositions(nodes, s.positions);
  if (compact) {
    s.cam = fitCamera(nodes, s.size.w, s.size.h, 32);
  } else if (s.follow !== null) {
    centerOn(s, s.follow);
  }
  s.draw();
}

/** Камера вписывает граф: в компактном виде всегда, в полном — до первой подгонки. */
function fitOnStart(s: CanvasState, nodes: readonly SimNode[], compact: boolean): void {
  if (compact || !s.fitted) {
    s.cam = fitCamera(nodes, s.size.w, s.size.h, compact ? 32 : 48);
    s.fitted = s.size.w > 0;
  }
}

/** Раскладка под новый граф: основная — сразу, без анимации; дальше доводка вживую (или сразу целиком при reduce-motion). */
function startLayout(graph: DocGraph, compact: boolean, neighborsOf: (id: string) => Set<string>, s: CanvasState): Simulation<SimNode, SimLink> {
  const nodes = toSimNodes(graph, s.positions);
  const reuse = placeNewNodes(nodes, neighborsOf) > 0;
  const links: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
  s.nodes = nodes;
  s.links = links;
  s.sim?.stop();
  const sim = buildSimulation(nodes, links, compact);
  const reduce = prefersReducedMotion();
  sim.alpha(reuse ? 0.35 : 1);
  sim.tick(reduce ? 300 : reuse ? 30 : 160);
  savePositions(nodes, s.positions);
  fitOnStart(s, nodes, compact);
  sim.on('tick', () => onLayoutTick(s, nodes, compact));
  if (!reduce) {
    sim.alpha(reuse ? 0.15 : 0.3).restart();
  }
  s.sim = sim;
  s.draw();
  return sim;
}

/** Выбор: камера едет к узлу и держит его в центре, пока раскладка не успокоится. */
function followSelection(s: CanvasState, selectedId: string | null, compact: boolean): void {
  s.follow = compact ? null : selectedId;
  if (s.follow !== null) {
    s.cam = { ...s.cam, k: Math.max(s.cam.k, 0.9) };
    centerOn(s, s.follow);
  }
  s.draw();
}

/** Точка события относительно холста. */
function localPoint(canvas: HTMLCanvasElement | null, e: { readonly clientX: number; readonly clientY: number }): Point {
  const rect = canvas?.getBoundingClientRect();
  return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
}

/** Наведение без нажатия: курсор и подсветка узла. */
function hoverAt(s: CanvasState, el: HTMLCanvasElement, p: Point): void {
  const id = nodeAt(s.nodes, s.cam, p)?.id ?? null;
  if (id !== s.hovered) {
    s.hovered = id;
    el.style.cursor = id === null ? 'grab' : 'pointer';
    s.draw();
  }
}

/** Движение с нажатием: сдвиг фона или перенос узла (в компактном виде узлы не двигаются). */
function dragTo(s: CanvasState, d: Drag, p: Point, compact: boolean): void {
  if (d.mode === 'pan') {
    s.follow = null;
    s.cam = { ...s.cam, x: s.cam.x + (p.x - d.x), y: s.cam.y + (p.y - d.y) };
    d.x = p.x;
    d.y = p.y;
    s.draw();
    return;
  }
  if (d.node !== null && !compact) {
    const w = toWorld(s.cam, p);
    d.node.fx = w.x;
    d.node.fy = w.y;
    s.sim?.alphaTarget(0.2).restart();
  }
}

function pointerMove(s: CanvasState, el: HTMLCanvasElement, p: Point, compact: boolean): void {
  const d = s.drag;
  if (d === null) {
    hoverAt(s, el, p);
    return;
  }
  d.moved ||= Math.hypot(p.x - d.x, p.y - d.y) > 3;
  if (d.moved) {
    dragTo(s, d, p, compact);
  }
}

/** Отпускание: узел освобождается; без движения — это клик, выбор узла или фона. */
function pointerUp(s: CanvasState): void {
  const d = s.drag;
  s.drag = null;
  if (d === null) {
    return;
  }
  if (d.node !== null) {
    d.node.fx = null;
    d.node.fy = null;
    s.sim?.alphaTarget(0);
  }
  if (!d.moved) {
    s.handlers.onSelect(d.node?.id ?? null);
  }
}

/** Подсказка над холстом: тип и описание наведённого узла. */
function hoverTitle(graph: DocGraph, hovered: string | null): string | undefined {
  const n = hovered === null ? undefined : graph.nodes.find((x) => x.id === hovered);
  return n === undefined ? undefined : `${NODE_KIND_LABELS.get(n.kind) ?? ''}: ${n.detail || n.label}`;
}

/** Перерисовка кадром, размер по контейнеру, раскладка, слежение за выбором. */
function useCanvasEffects(canvasRef: RefObject<HTMLCanvasElement | null>, s: CanvasState, graph: DocGraph, compact: boolean): void {
  const neighborsOf = useNeighbors(graph);
  s.draw = () => {
    if (s.frame === 0) {
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        drawFrame(canvasRef.current, s, neighborsOf, compact);
      });
    }
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ro = new ResizeObserver(() => resizeCanvas(canvas, s, compact));
    ro.observe(canvas);
    resizeCanvas(canvas, s, compact);
    // Тема сменилась — палитра другая.
    const mo = new MutationObserver(() => s.draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [compact]);
  useEffect(() => {
    const sim = startLayout(graph, compact, neighborsOf, s);
    return () => {
      sim.stop();
    };
  }, [graph, compact, neighborsOf]);
  const { selectedId, matches } = s.focus;
  useEffect(() => followSelection(s, selectedId, compact), [selectedId, matches, compact]);
  useEffect(
    () => () => {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
    },
    [],
  );
}

/**
 * Холст графа.
 */
export function DocGraphCanvas(props: DocGraphCanvasProps) {
  const { graph, selectedId, compact = false } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const s = useRef<CanvasState | null>(null);
  s.current ??= newCanvasState(props);
  const st = s.current;
  st.focus = { selectedId, matches: props.matches };
  st.handlers = { onSelect: props.onSelect, onOpen: props.onOpen };
  useCanvasEffects(canvasRef, st, graph, compact);
  const at = (e: { readonly clientX: number; readonly clientY: number }): Point => localPoint(canvasRef.current, e);
  return (
    <canvas
      ref={canvasRef}
      className={`doc-graph__canvas${compact ? ' doc-graph__canvas--compact' : ''}`}
      data-testid={props.testId}
      data-nodes={graph.nodes.length}
      data-edges={graph.edges.length}
      data-selected={selectedId ?? ''}
      role="img"
      aria-label={props.ariaLabel}
      title={hoverTitle(graph, st.hovered)}
      onPointerDown={(e) => {
        const p = at(e);
        const n = nodeAt(st.nodes, st.cam, p);
        st.drag = { mode: n === null ? 'pan' : 'node', node: n, x: p.x, y: p.y, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => pointerMove(st, e.currentTarget, at(e), compact)}
      onPointerUp={() => pointerUp(st)}
      onPointerLeave={() => {
        if (st.hovered !== null) {
          st.hovered = null;
          st.draw();
        }
      }}
      onDoubleClick={(e) => {
        const n = nodeAt(st.nodes, st.cam, at(e));
        if (n !== null) {
          st.handlers.onOpen(n.id);
        }
      }}
      onWheel={(e) => {
        if (!compact) {
          st.follow = null;
          st.cam = zoomAt(st.cam, at(e), e.deltaY);
          st.draw();
        }
      }}
    />
  );
}
