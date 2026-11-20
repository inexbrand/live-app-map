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
  const pageNodes = document.nodes.filter(
    (n) =>
      n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external' || n.kind === 'service',
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered =
    normalizedQuery.length > 0
      ? pageNodes.filter(
          (n) =>
            n.title.toLowerCase().includes(normalizedQuery) ||
            n.id.toLowerCase().includes(normalizedQuery) ||
            n.pathPattern.toLowerCase().includes(normalizedQuery),
        )
      : pageNodes;

  const filteredIds = new Set(filtered.map((n) => n.id));
  const navEdges = document.edges.filter((e) => {
    if (e.to === null) {
      return false;
    }
    if (e.kind === 'wraps' || e.kind === 'parent') {
      return false;
    }
    return filteredIds.has(e.from) && filteredIds.has(e.to);
  });

  return { filtered, navEdges, normalizedQuery };
}
