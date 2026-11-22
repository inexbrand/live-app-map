/**
 * Геометрия холста графа: размер узла, камера (вписать, центрировать, масштаб колесом),
 * перевод экранных точек в мировые, попадание в узел, узлы симуляции из графа. Чистые функции.
 */
import type { DocGraph } from '../../lib/doc-graph';
import type { Camera, SimNode } from './graph-draw';

const MIN_K = 0.15;
const MAX_K = 3;

/** Точка на холсте в css-пикселях. */
export type Point = { readonly x: number; readonly y: number };

/** Радиус узла по типу и числу связей. */
export function nodeRadius(kind: SimNode['kind'], degree: number): number {
  const base = kind === 'epoch' ? 7 : kind === 'note' || kind === 'guide' ? 6 : kind === 'epoch-file' || kind === 'file' ? 3.5 : 4.5;
  return base + Math.min(8, Math.sqrt(degree) * 1.2);
}

/** Камера, вписывающая узлы в рамку. */
export function fitCamera(nodes: readonly SimNode[], w: number, h: number, pad: number): Camera {
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

/** Камера с тем же масштабом, в центре которой узел; узел без координат — камера как была. */
export function centeredCamera(n: SimNode | undefined, cam: Camera, size: { readonly w: number; readonly h: number }): Camera {
  if (n?.x === undefined || n.y === undefined) {
    return cam;
  }
  return { k: cam.k, x: size.w / 2 - n.x * cam.k, y: size.h / 2 - n.y * cam.k };
}

/** Точка экрана в мировых координатах. */
export function toWorld(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) / c.k, y: (p.y - c.y) / c.k };
}

/** Узел под точкой экрана. */
export function nodeAt(nodes: readonly SimNode[], c: Camera, p: Point): SimNode | null {
  const { x: wx, y: wy } = toWorld(c, p);
  let best: SimNode | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = n.x === undefined || n.y === undefined ? Infinity : Math.hypot(n.x - wx, n.y - wy);
    if (d < (n.r + 6) / Math.min(1, c.k) && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Масштаб колесом под курсором. */
export function zoomAt(c: Camera, p: Point, deltaY: number): Camera {
  const k = Math.min(MAX_K, Math.max(MIN_K, c.k * Math.exp(-deltaY * 0.0015)));
  return { k, x: p.x - ((p.x - c.x) * k) / c.k, y: p.y - ((p.y - c.y) * k) / c.k };
}

/** Число рёбер у каждого узла. */
export function nodeDegrees(graph: DocGraph): Map<string, number> {
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  return degree;
}

/** Узлы симуляции; уже размещённые сохраняют позицию. */
export function toSimNodes(graph: DocGraph, prev: ReadonlyMap<string, { x: number; y: number }>): SimNode[] {
  const degree = nodeDegrees(graph);
  return graph.nodes.map((n) => {
    const p = prev.get(n.id);
    return { id: n.id, kind: n.kind, label: n.label, notReady: n.readiness === 'not-ready', r: nodeRadius(n.kind, degree.get(n.id) ?? 0), ...(p === undefined ? {} : { x: p.x, y: p.y }) };
  });
}
