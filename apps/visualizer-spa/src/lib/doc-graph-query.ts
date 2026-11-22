/**
 * Запросы к графу документации: свёрнутые эпохи, фильтр, соседи, локальный граф, поиск.
 */
import type { EpochReadiness } from '@live-app-map/schema';
import { GraphBuilder, type DocGraph, type GraphNodeKind } from './doc-graph';

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
  const readiness = f.readiness ?? null;
  const anchors = new Set(
    g.nodes
      .filter((n) => isDocKind(n.kind) && (readiness === null || n.kind === 'note' || n.kind === 'guide' || n.readiness === readiness))
      .map((n) => n.id),
  );
  const linked = new Set<string>();
  for (const e of g.edges) {
    if (anchors.has(e.source)) {
      linked.add(e.target);
    }
    if (anchors.has(e.target)) {
      linked.add(e.source);
    }
  }
  const visible = new Set<string>(
    g.nodes.filter((n) => anchors.has(n.id) && (kinds === null || kinds.has(n.kind))).map((n) => n.id),
  );
  for (const n of g.nodes) {
    if (!isDocKind(n.kind) && n.kind !== 'service' && linked.has(n.id) && (kinds === null || kinds.has(n.kind))) {
      visible.add(n.id);
    }
  }
  for (const e of g.edges) {
    if (e.kind === 'belongs' && visible.has(e.source) && (kinds === null || kinds.has('service'))) {
      visible.add(e.target);
    }
  }
  return {
    nodes: g.nodes.filter((n) => visible.has(n.id)),
    edges: g.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
  };
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
export function localGraph(g: DocGraph, id: string, depth: number): DocGraph {
  if (!g.nodes.some((n) => n.id === id)) {
    return { nodes: [], edges: [] };
  }
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const y of adj.get(x) ?? []) {
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
        }
      }
    }
    frontier = next;
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
