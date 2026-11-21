/**
 * Граф на canvas с раскладкой d3-force: сотни узлов без DOM на каждый узел.
 * Колесо — масштаб под курсором, перетаскивание фона — сдвиг, узла — перенос;
 * клик выбирает узел, двойной клик открывает его. Позиции узлов переживают
 * смену фильтров и раскрытие эпох: новые узлы появляются рядом с соседями.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import { useEffect, useMemo, useRef } from 'react';
import { graphNeighbors, NODE_KIND_LABELS, type DocGraph } from '../../lib/doc-graph';
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

const MIN_K = 0.15;
const MAX_K = 3;

/** Радиус узла по типу и числу связей. */
function nodeRadius(kind: SimNode['kind'], degree: number): number {
  const base = kind === 'epoch' ? 7 : kind === 'note' || kind === 'guide' ? 6 : kind === 'epoch-file' || kind === 'file' ? 3.5 : 4.5;
  return base + Math.min(8, Math.sqrt(degree) * 1.2);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Камера, вписывающая узлы в рамку. */
function fitCamera(nodes: readonly SimNode[], w: number, h: number, pad: number): Camera {
  const xs = nodes.flatMap((n) => (n.x === undefined ? [] : [n.x]));
  const ys = nodes.flatMap((n) => (n.y === undefined ? [] : [n.y]));
  if (xs.length === 0) {
    return { x: w / 2, y: h / 2, k: 1 };
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY))));
  return { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
}

/**
 * Холст графа.
 */
export function DocGraphCanvas(props: DocGraphCanvasProps) {
  const { graph, selectedId, matches, compact = false } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 });
  /** Узел, за которым камера следует, пока раскладка двигается; сдвиг или масштаб рукой отпускает его. */
  const follow = useRef<string | null>(null);
  /** Ставит узел в центр холста при текущем масштабе. */
  const centerOn = (id: string): void => {
    const n = nodesRef.current.find((x) => x.id === id);
    if (n?.x !== undefined && n.y !== undefined) {
      const k = cam.current.k;
      cam.current = { k, x: size.current.w / 2 - n.x * k, y: size.current.h / 2 - n.y * k };
    }
  };
  const fitted = useRef(false);
  const hovered = useRef<string | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const frame = useRef(0);
  const focusRef = useRef({ selectedId, matches });
  focusRef.current = { selectedId, matches };
  const handlers = useRef({ onSelect: props.onSelect, onOpen: props.onOpen });
  handlers.current = { onSelect: props.onSelect, onOpen: props.onOpen };

  const neighborsOf = useMemo(() => {
    const cache = new Map<string, Set<string>>();
    return (id: string): Set<string> => {
      const hit = cache.get(id);
      if (hit !== undefined) {
        return hit;
      }
      const s = graphNeighbors(graph, id);
      cache.set(id, s);
      return s;
    };
  }, [graph]);

  /** Перерисовать в ближайший кадр. */
  const requestDraw = useRef(() => {});
  requestDraw.current = () => {
    if (frame.current !== 0) {
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas === null || ctx === null || ctx === undefined) {
        return;
      }
      const { selectedId: sel, matches: m } = focusRef.current;
      const center = hovered.current ?? sel;
      const lit = center === null ? new Set<string>() : new Set([center, ...neighborsOf(center)]);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGraph(ctx, size.current, nodesRef.current, linksRef.current, cam.current, { selected: sel, hovered: hovered.current, lit, matches: m }, readPalette(canvas), compact);
    });
  };

  // Размер canvas по контейнеру.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (compact || (!fitted.current && rect.width > 0 && nodesRef.current.length > 0)) {
        cam.current = fitCamera(nodesRef.current, rect.width, rect.height, compact ? 32 : 48);
        fitted.current = rect.width > 0;
      }
      requestDraw.current();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    // Тема сменилась — палитра другая.
    const mo = new MutationObserver(() => requestDraw.current());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [compact]);

  // Симуляция под новый граф.
  useEffect(() => {
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const prev = positions.current;
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const p = prev.get(n.id);
      return { id: n.id, kind: n.kind, label: n.label, notReady: n.readiness === 'not-ready', r: nodeRadius(n.kind, degree.get(n.id) ?? 0), ...(p === undefined ? {} : { x: p.x, y: p.y }) };
    });
    // Новый узел — рядом с уже размещённым соседом, чтобы раскрытие не взрывало раскладку.
    const placed = new Map(nodes.filter((n) => n.x !== undefined).map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.x !== undefined) {
        continue;
      }
      const near = [...neighborsOf(n.id)].map((id) => placed.get(id)).find((x) => x !== undefined);
      if (near?.x !== undefined && near.y !== undefined) {
        n.x = near.x + (Math.random() - 0.5) * 30;
        n.y = near.y + (Math.random() - 0.5) * 30;
      }
    }
    const links: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
    nodesRef.current = nodes;
    linksRef.current = links;
    simRef.current?.stop();
    const reuse = placed.size > 0;
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => (l.kind === 'contains' ? 30 : 70)).strength(0.4))
      .force('charge', forceManyBody<SimNode>().strength(compact ? -140 : -110).distanceMax(compact ? 300 : 520))
      .force('collide', forceCollide<SimNode>((d) => d.r + 4))
      .force('x', forceX<SimNode>(0).strength(0.04))
      .force('y', forceY<SimNode>(0).strength(0.04))
      .stop();
    // Основная раскладка — сразу, без анимации; дальше доводка вживую (или сразу целиком при reduce-motion).
    const settle = prefersReducedMotion() ? 300 : reuse ? 30 : 160;
    sim.alpha(reuse ? 0.35 : 1);
    sim.tick(settle);
    const save = (): void => {
      for (const n of nodes) {
        if (n.x !== undefined && n.y !== undefined) {
          positions.current.set(n.id, { x: n.x, y: n.y });
        }
      }
    };
    save();
    if (compact || !fitted.current) {
      cam.current = fitCamera(nodes, size.current.w, size.current.h, compact ? 32 : 48);
      fitted.current = size.current.w > 0;
    }
    sim.on('tick', () => {
      save();
      if (compact) {
        cam.current = fitCamera(nodes, size.current.w, size.current.h, 32);
      } else if (follow.current !== null) {
        centerOn(follow.current);
      }
      requestDraw.current();
    });
    if (!prefersReducedMotion()) {
      sim.alpha(reuse ? 0.15 : 0.3).restart();
    }
    simRef.current = sim;
    requestDraw.current();
    return () => {
      sim.stop();
    };
  }, [graph, compact, neighborsOf]);

  // Выбор: камера едет к узлу и держит его в центре, пока раскладка не успокоится.
  useEffect(() => {
    follow.current = compact ? null : selectedId;
    if (follow.current !== null) {
      cam.current = { ...cam.current, k: Math.max(cam.current.k, 0.9) };
      centerOn(follow.current);
    }
    requestDraw.current();
  }, [selectedId, matches, compact]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  /** Узел под точкой экрана. */
  const nodeAt = (px: number, py: number): SimNode | null => {
    const c = cam.current;
    const wx = (px - c.x) / c.k;
    const wy = (py - c.y) / c.k;
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      if (n.x === undefined || n.y === undefined) {
        continue;
      }
      const d = Math.hypot(n.x - wx, n.y - wy);
      const reach = (n.r + 6) / Math.min(1, c.k);
      if (d < reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  const drag = useRef<{ mode: 'pan' | 'node'; node: SimNode | null; x: number; y: number; moved: boolean } | null>(null);

  const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const hoveredNode = hovered.current === null ? undefined : graph.nodes.find((n) => n.id === hovered.current);
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
      title={hoveredNode === undefined ? undefined : `${NODE_KIND_LABELS.get(hoveredNode.kind) ?? ''}: ${hoveredNode.detail || hoveredNode.label}`}
      onPointerDown={(e) => {
        const p = local(e);
        const n = nodeAt(p.x, p.y);
        drag.current = { mode: n === null ? 'pan' : 'node', node: n, x: p.x, y: p.y, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = local(e);
        const d = drag.current;
        if (d === null) {
          const n = nodeAt(p.x, p.y);
          const id = n?.id ?? null;
          if (id !== hovered.current) {
            hovered.current = id;
            e.currentTarget.style.cursor = id === null ? 'grab' : 'pointer';
            requestDraw.current();
          }
          return;
        }
        if (Math.hypot(p.x - d.x, p.y - d.y) > 3) {
          d.moved = true;
        }
        if (!d.moved) {
          return;
        }
        if (d.mode === 'pan') {
          follow.current = null;
          cam.current = { ...cam.current, x: cam.current.x + (p.x - d.x), y: cam.current.y + (p.y - d.y) };
          d.x = p.x;
          d.y = p.y;
          requestDraw.current();
          return;
        }
        if (d.node !== null && !compact) {
          d.node.fx = (p.x - cam.current.x) / cam.current.k;
          d.node.fy = (p.y - cam.current.y) / cam.current.k;
          simRef.current?.alphaTarget(0.2).restart();
        }
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d === null) {
          return;
        }
        if (d.node !== null) {
          d.node.fx = null;
          d.node.fy = null;
          simRef.current?.alphaTarget(0);
        }
        if (!d.moved) {
          handlers.current.onSelect(d.node?.id ?? null);
        }
      }}
      onPointerLeave={() => {
        if (hovered.current !== null) {
          hovered.current = null;
          requestDraw.current();
        }
      }}
      onDoubleClick={(e) => {
        const p = local(e);
        const n = nodeAt(p.x, p.y);
        if (n !== null) {
          handlers.current.onOpen(n.id);
        }
      }}
      onWheel={(e) => {
        if (compact) {
          return;
        }
        const p = local(e);
        const c = cam.current;
        const k = Math.min(MAX_K, Math.max(MIN_K, c.k * Math.exp(-e.deltaY * 0.0015)));
        follow.current = null;
        cam.current = { k, x: p.x - ((p.x - c.x) * k) / c.k, y: p.y - ((p.y - c.y) * k) / c.k };
        requestDraw.current();
      }}
    />
  );
}
