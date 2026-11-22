/**
 * Запросы к графу документации: свёрнутые эпохи, фильтр, соседи, локальный граф, поиск.
 */
import type { EpochReadiness } from '@live-app-map/schema';
import { GraphBuilder, type DocGraph, type GraphNode, type GraphNodeKind } from './doc-graph';

/**
 * Свёртка: файлы нераскрытых эпох убираются, их ссылки переходят на эпоху.
 *
 * @param g - полный граф
 * @param expanded - id раскрытых эпох (`DocEpoch.id`)
 * @returns граф с эпохами-узлами
 */
export function collapseEpochs(g: DocGraph, expanded: ReadonlySet<string>): DocGraph {
  const owner = new Map<string, string>();
  for (const n of g.nodes) {
    if (n.kind === 'epoch-file' && n.epochId !== undefined && !expanded.has(n.epochId)) {
      owner.set(n.id, `epoch:${n.epochId}`);
    }
  }
  const b = new GraphBuilder();
  g.nodes.filter((n) => !owner.has(n.id)).forEach((n) => b.node(n));
  for (const e of g.edges) {
    b.edge(owner.get(e.source) ?? e.source, owner.get(e.target) ?? e.target, e.kind);
  }
  return { nodes: [...b.nodes.values()], edges: b.edges };
}

/** Фильтр графа. */
export type GraphFilter = {
  /** Видимые типы; пусто — все. */
  readonly kinds?: ReadonlySet<GraphNodeKind>;
  /** Готовность эпох; null — любая. */
  readonly readiness?: EpochReadiness | null;
};

/** Узел документа (не объект карты). */
function isDocKind(k: GraphNodeKind): boolean {
  return k === 'epoch' || k === 'epoch-file' || k === 'note' || k === 'guide';
}

/**
 * Фильтр по типу и готовности. Готовность выбирает документы-опоры; объект карты
 * остаётся, если на него ссылается опора (даже когда сами документы скрыты типом —
 * «только файлы кода» показывает файлы, упомянутые в документах). Сервисы — если
 * видим их роут или таблица.
 *
 * @param g - граф
 * @param f - фильтр
 * @returns отфильтрованный граф
 */
export function filterGraph(g: DocGraph, f: GraphFilter): DocGraph {
  const kinds = f.kinds === undefined || f.kinds.size === 0 ? null : f.kinds;
  const allowed = (kind: GraphNodeKind): boolean => kinds === null || kinds.has(kind);
  const anchors = anchorIds(g, f.readiness ?? null);
  const linked = linkedIds(g, anchors);
  const visible = new Set(g.nodes.filter((n) => (anchors.has(n.id) || isLinkedObject(n, linked)) && allowed(n.kind)).map((n) => n.id));
  if (allowed('service')) {
    addOwners(g, visible);
  }
  return {
    nodes: g.nodes.filter((n) => visible.has(n.id)),
    edges: g.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
  };
}

/** Сервисы видимых узлов (ребро belongs) — тоже видимы. */
function addOwners(g: DocGraph, visible: Set<string>): void {
  for (const e of g.edges) {
    if (e.kind === 'belongs' && visible.has(e.source)) {
      visible.add(e.target);
    }
  }
}

/** Документы под фильтр готовности (заметки и руководства — всегда). */
function anchorIds(g: DocGraph, readiness: GraphFilter['readiness'] | null): Set<string> {
  return new Set(
    g.nodes
      .filter((n) => isDocKind(n.kind) && (readiness === null || n.kind === 'note' || n.kind === 'guide' || n.readiness === readiness))
      .map((n) => n.id),
  );
}

/** Узлы, связанные ребром с документом-якорем. */
function linkedIds(g: DocGraph, anchors: ReadonlySet<string>): Set<string> {
  const linked = new Set<string>();
  for (const e of g.edges) {
    if (anchors.has(e.source)) {
      linked.add(e.target);
    }
    if (anchors.has(e.target)) {
      linked.add(e.source);
    }
  }
  return linked;
}

/** Объект карты (не документ и не сервис), на который ссылается якорь. */
function isLinkedObject(n: GraphNode, linked: ReadonlySet<string>): boolean {
  return !isDocKind(n.kind) && n.kind !== 'service' && linked.has(n.id);
}

/**
 * Соседи узла.
 *
 * @param g - граф
 * @param id - узел
 * @returns id соседей (без самого узла)
 */
export function graphNeighbors(g: DocGraph, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of g.edges) {
    if (e.source === id) {
      out.add(e.target);
    } else if (e.target === id) {
      out.add(e.source);
    }
  }
  return out;
}

/**
 * Локальный граф: узел и всё в пределах depth шагов (как local graph в Obsidian).
 *
 * @param g - граф
 * @param id - центр
 * @param depth - глубина (1–3)
 * @returns подграф; центра нет в графе — пустой
 */
/** Соседи каждого узла (рёбра без направления). */
function adjacency(g: DocGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  return adj;
}

/** Следующее кольцо обхода: ещё не виденные соседи (seen пополняется). */
function nextRing(frontier: readonly string[], adj: ReadonlyMap<string, readonly string[]>, seen: Set<string>): string[] {
  const next: string[] = [];
  for (const y of frontier.flatMap((x) => adj.get(x) ?? [])) {
    if (!seen.has(y)) {
      seen.add(y);
      next.push(y);
    }
  }
  return next;
}

export function localGraph(g: DocGraph, id: string, depth: number): DocGraph {
  if (!g.nodes.some((n) => n.id === id)) {
    return { nodes: [], edges: [] };
  }
  const adj = adjacency(g);
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    frontier = nextRing(frontier, adj, seen);
  }
  return { nodes: g.nodes.filter((n) => seen.has(n.id)), edges: g.edges.filter((e) => seen.has(e.source) && seen.has(e.target)) };
}

/**
 * Узлы, у которых подпись или полное имя содержат все слова запроса.
 *
 * @param g - граф
 * @param query - запрос
 * @returns id найденных; пустой запрос — пусто
 */
export function searchGraph(g: DocGraph, query: string): Set<string> {
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return new Set();
  }
  return new Set(g.nodes.filter((n) => words.every((w) => `${n.label}\n${n.detail}`.toLowerCase().includes(w))).map((n) => n.id));
}
