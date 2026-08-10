/**
 * Auto-layout через dagre.
 */
import dagre from '@dagrejs/dagre';
import type { AppMapEdge, AppMapNode } from '@live-app-map/schema';
import { computeNodeLayout, DEFAULT_VIEWPORT } from '../lib/viewport';

/** Дефолтные габариты под 16:9 @ 0.75 (dagre spacing). */
const defaultLayout = computeNodeLayout(DEFAULT_VIEWPORT, 0.75);
export const NODE_W = defaultLayout.outerWidth;
export const NODE_H = defaultLayout.outerHeight;

export type Positioned = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
};

/**
 * Раскладка LR; если у ноды есть position — сохраняем.
 */
export function layoutNodes(
  nodes: readonly AppMapNode[],
  edges: readonly AppMapEdge[],
  direction: 'LR' | 'TB' = 'LR',
): Map<string, Positioned> {
  const withPos = nodes.filter((n) => n.position);
  if (withPos.length === nodes.length && nodes.length > 0) {
    return new Map(
      nodes.map((n) => [
        n.id,
        { id: n.id, x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      ]),
    );
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    if (e.to && g.hasNode(e.from) && g.hasNode(e.to)) {
      g.setEdge(e.from, e.to);
    }
  }

  dagre.layout(g);

  const out = new Map<string, Positioned>();
  for (const n of nodes) {
    if (n.position) {
      out.set(n.id, { id: n.id, x: n.position.x, y: n.position.y });
      continue;
    }
    const pos = g.node(n.id) as { x: number; y: number } | undefined;
    out.set(n.id, {
      id: n.id,
      x: (pos?.x ?? 0) - NODE_W / 2,
      y: (pos?.y ?? 0) - NODE_H / 2,
    });
  }
  return out;
}
