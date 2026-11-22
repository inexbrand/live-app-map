/**
 * Фильтр графа для холста: какие ноды и рёбра рисовать.
 */
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';

/**
 * Результат фильтрации графа для canvas (поиск + без orphan-рёбер).
 */
export type CanvasGraphFilterResult = {
  readonly filtered: readonly AppMapNode[];
  readonly navEdges: readonly AppMapEdge[];
  /** Нормализованный query (trim + lower); пустая строка = без фильтра. */
  readonly normalizedQuery: string;
};

/**
 * Фильтрует page-ноды по searchQuery и оставляет только рёбра между ними.
 * Orphan edges (конец вне filtered) не попадают в результат.
 *
 * @param document - загруженный AppMap
 * @param searchQuery - строка поиска из store
 * @returns filtered-ноды, согласованные nav-рёбра и нормализованный query
 */
export function filterCanvasGraph(
  document: AppMapDocument,
  searchQuery: string,
): CanvasGraphFilterResult {
  const pageNodes = document.nodes.filter((n) => CANVAS_KINDS.has(n.kind));
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = normalizedQuery.length > 0 ? pageNodes.filter((n) => matchesQuery(n, normalizedQuery)) : pageNodes;
  const filteredIds = new Set(filtered.map((n) => n.id));
  const navEdges = document.edges.filter((e) => isNavEdge(e, filteredIds));
  return { filtered, navEdges, normalizedQuery };
}

const CANVAS_KINDS = new Set(['page', 'not-found', 'external', 'service']);

function matchesQuery(n: AppMapDocument['nodes'][number], q: string): boolean {
  return [n.title, n.id, n.pathPattern].some((s) => s.toLowerCase().includes(q));
}

/** Переход между видимыми нодами (обёртки и родители — не переходы). */
function isNavEdge(e: AppMapDocument['edges'][number], ids: ReadonlySet<string>): boolean {
  return e.to !== null && e.kind !== 'wraps' && e.kind !== 'parent' && ids.has(e.from) && ids.has(e.to);
}