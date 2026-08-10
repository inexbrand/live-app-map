/**
 * React Flow canvas для AppMapDocument.
 */
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';
import { useMemo } from 'react';
import { useAppStore } from '../store/app-store';
import { layoutNodes } from './layout';
import { PageNode, type PageNodeData } from './PageNode';

const nodeTypes = { page: PageNode };

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
    (n) => n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external',
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

/**
 * Холст React Flow: layout страниц, поиск, empty state при нуле совпадений.
 */
export function AppMapCanvas() {
  const document = useAppStore((s) => s.document);
  const selectPage = useAppStore((s) => s.selectPage);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const { nodes, edges, isSearchMiss, displayQuery } = useMemo(() => {
    if (!document) {
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        isSearchMiss: false,
        displayQuery: '',
      };
    }

    const { filtered, navEdges, normalizedQuery } = filterCanvasGraph(
      document,
      searchQuery,
    );
    const isSearchMiss = normalizedQuery.length > 0 && filtered.length === 0;

    if (isSearchMiss) {
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        isSearchMiss: true,
        displayQuery: searchQuery.trim(),
      };
    }

    const positions = layoutNodes(filtered, navEdges, 'LR');
    const nodes: Node[] = filtered.map((n) => {
      const pos = positions.get(n.id);
      return {
        id: n.id,
        type: 'page',
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        data: { node: n } satisfies PageNodeData,
      };
    });
    const edges: Edge[] = navEdges.map((e) => {
      const target = e.to;
      if (target === null) {
        throw new Error(`Ожидалось ребро с target: ${e.id}`);
      }
      return {
        id: e.id,
        source: e.from,
        target,
        label: e.label,
        animated: e.kind === 'redirect',
        style: { stroke: '#5b8cff' },
      };
    });
    return {
      nodes,
      edges,
      isSearchMiss: false,
      displayQuery: searchQuery.trim(),
    };
  }, [document, searchQuery]);

  if (!document) {
    return null;
  }

  if (isSearchMiss) {
    return (
      <div
        className="empty-state"
        data-lam-search-empty
        role="status"
        aria-live="polite"
      >
        <div className="empty-state__card">
          <h1>Ничего не найдено</h1>
          <p>
            По запросу <strong>«{displayQuery}»</strong> страниц нет.
          </p>
          <p className="drawer__hint">
            Сбросьте поиск или измените запрос в поле «Поиск» на панели сверху.
          </p>
          <div className="empty-state__actions">
            <button
              type="button"
              className="btn btn--primary empty-state__cta"
              data-lam-search-clear
              style={{ minHeight: 44, minWidth: 44, padding: '10px 18px' }}
              onClick={() => setSearchQuery('')}
            >
              Сбросить поиск
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => selectPage(null)}
      onNodeClick={(_, n) => selectPage(n.id)}
    >
      <Background gap={18} color="#2a3140" />
      <MiniMap pannable zoomable />
      <Controls />
    </ReactFlow>
  );
}
