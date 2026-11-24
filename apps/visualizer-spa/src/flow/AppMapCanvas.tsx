/**
 * React Flow canvas для AppMapDocument.
 */
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useRef, type RefObject } from 'react';
import type { AppMapDocument, AppMapNode } from '@live-app-map/schema';
import type { CanvasSizing } from './canvas-layout';
import { filterCanvasGraph } from './canvas-graph';
import { useAppStore } from '../store/app-store';
import { GroupFrameNode, type GroupFrameData } from './GroupFrameNode';
import { startViewport, type LayoutBox, type PackedLayout } from './pack-layout';
import { canvasNodeSize, layoutCanvas } from './canvas-layout';
import { RevealSelected } from './RevealSelected';
import { LamMiniMap } from './LamMiniMap';
import { layoutBounds, minimapSize } from './minimap';
import { PageNode, type PageNodeData } from './PageNode';
import { SERVICE_NODE_SIZE, ServiceNode, type ServiceNodeData } from './ServiceNode';

const nodeTypes = { page: PageNode, service: ServiceNode, groupFrame: GroupFrameNode };

/** Стартовый масштаб: не мельче — иначе подписи нод не читаются. */
const START_ZOOM = { min: 0.75, max: 1 };

export { filterCanvasGraph, type CanvasGraphFilterResult } from './canvas-graph';

/** Граф холста: ноды и рёбра React Flow плюс раскладка для стартового кадра. */
type FlowGraph = {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly packed: PackedLayout;
  readonly boxes: LayoutBox[];
};

/** Холст: граф или «по запросу ничего нет». */
type CanvasView = { readonly kind: 'graph'; readonly graph: FlowGraph } | { readonly kind: 'miss'; readonly query: string };

/** Рамки групп: под нодами, не выбираются, со счётом экранов группы. */
function frameNodes(packed: PackedLayout, boxes: readonly LayoutBox[]): Node[] {
  return packed.groups.map((g) => ({
    id: `frame:${g.id}`,
    type: 'groupFrame',
    position: { x: g.x, y: g.y },
    width: g.width,
    height: g.height,
    style: { width: g.width, height: g.height },
    zIndex: -1,
    selectable: false,
    draggable: false,
    focusable: false,
    data: { title: g.title, count: boxes.filter((b) => b.group === g.id).length } satisfies GroupFrameData,
  }));
}

/** Нода экрана или сервиса в своей позиции; размер экрана — тот же расчёт, что в PageNode. */
function flowNode(doc: AppMapDocument, n: AppMapNode, pos: { readonly x: number; readonly y: number } | undefined, sizing: CanvasSizing, selected: boolean): Node {
  const position = { x: pos?.x ?? 0, y: pos?.y ?? 0 };
  if (n.kind === 'service') {
    return { id: n.id, type: 'service', position, ...SERVICE_NODE_SIZE, style: { ...SERVICE_NODE_SIZE }, data: { node: n } satisfies ServiceNodeData };
  }
  // Тот же расчёт, что в PageNode: размер ноды React Flow = размер DOM
  const layout = canvasNodeSize(doc, n, sizing, selected);
  return {
    id: n.id,
    type: 'page',
    position,
    // xyflow: width/height + style — один math с PageNode DOM
    width: layout.outerWidth,
    height: layout.outerHeight,
    style: { width: layout.outerWidth, height: layout.outerHeight },
    data: { node: n } satisfies PageNodeData,
  };
}

/**
 * Ребро навигации; вызовы API экрана — пунктиром, чтобы не путать с навигацией.
 * Подпись — только у рёбер выбранного экрана: иначе подписи налезают на карточки.
 */
function flowEdge(e: ReturnType<typeof filterCanvasGraph>['navEdges'][number], selectedPageId: string | null): Edge {
  const target = e.to;
  if (target === null) {
    throw new Error(`Ожидалось ребро с target: ${e.id}`);
  }
  return {
    id: e.id,
    source: e.from,
    target,
    label: selectedPageId !== null && (e.from === selectedPageId || target === selectedPageId) ? e.label : undefined,
    animated: e.kind === 'redirect',
    style: e.kind === 'api' ? { stroke: 'var(--edge-api)', strokeDasharray: '4 4' } : { stroke: 'var(--edge)' },
  };
}

/**
 * Что показать на холсте по карте и фильтру.
 *
 * @param doc - карта
 * @param searchQuery - фильтр холста
 * @param sizing - масштаб и окна нод
 * @param selectedPageId - выбранный экран (у него шире рамка)
 */
export function canvasView(doc: AppMapDocument, searchQuery: string, sizing: CanvasSizing, selectedPageId: string | null): CanvasView {
  const { filtered, navEdges, normalizedQuery } = filterCanvasGraph(doc, searchQuery);
  if (normalizedQuery.length > 0 && filtered.length === 0) {
    return { kind: 'miss', query: searchQuery.trim() };
  }
  const { boxes, packed } = layoutCanvas(doc, filtered, navEdges, sizing);
  const nodes = filtered.map((n) => flowNode(doc, n, packed.positions.get(n.id), sizing, selectedPageId === n.id));
  return { kind: 'graph', graph: { nodes: [...frameNodes(packed, boxes), ...nodes], edges: navEdges.map((e) => flowEdge(e, selectedPageId)), packed, boxes } };
}

/** Холст по store: карта, фильтр, масштаб, окна и высоты нод, выбор. */
function useCanvasView(): CanvasView | null {
  const document = useAppStore((s) => s.document);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const nodeViewports = useAppStore((s) => s.nodeViewports);
  const contentHeights = useAppStore((s) => s.contentHeights);
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  return useMemo(
    () => (document ? canvasView(document, searchQuery, { iframeScale, nodeViewports, contentHeights }, selectedPageId) : null),
    [document, searchQuery, iframeScale, nodeViewports, contentHeights, selectedPageId],
  );
}

/** По фильтру холста экранов нет: подсказка и сброс. */
function SearchMiss({ query }: { readonly query: string }) {
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
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
          По запросу <strong>«{query}»</strong> страниц нет.
        </p>
        <p className="drawer__hint">
          Сбросьте фильтр холста или найдите экран через поиск (⌘K).
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

/** Ниже этого масштаба холст — обзор: крупные подписи вместо мелочей карточек. */
export const OVERVIEW_ZOOM = 0.4;

/**
 * Масштаб в стили хоста: переменная --lam-zoom (подписи обзора растут обратно масштабу)
 * и класс обзора. Через DOM, а не state: зум идёт каждый кадр, ноды не перерисовываются.
 *
 * @param el - хост холста
 * @param zoom - масштаб камеры
 */
export function applyZoomStyle(el: HTMLElement | null, zoom: number): void {
  if (el === null) {
    return;
  }
  el.style.setProperty('--lam-zoom', String(zoom));
  el.classList.toggle('flow-host--overview', zoom < OVERVIEW_ZOOM);
}

/** Движение камеры: масштаб в стиль хоста (подписи, обзор); экраны — холсты, прятать нечего. */
function zoomHandlers(hostRef: RefObject<HTMLDivElement | null>) {
  return {
    onMove: (_: unknown, vp: { readonly zoom: number }) => applyZoomStyle(hostRef.current, vp.zoom),
  };
}

/** Граф на React Flow: стартовый кадр, зум, выбор кликом, мини-карта. */
function FlowCanvas({ doc, graph }: { readonly doc: AppMapDocument; readonly graph: FlowGraph }) {
  const selectPage = useAppStore((s) => s.selectPage);
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const hostRef = useRef<HTMLDivElement>(null);
  const zoom = zoomHandlers(hostRef);
  const { nodes, edges, packed, boxes } = graph;
  const miniSize = useMemo(
    () => minimapSize(layoutBounds(nodes.map((n) => ({ x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 })))),
    [nodes],
  );
  const groupOrder = useMemo(() => (doc.groups ?? []).map((g) => g.id), [doc]);
  return (
    <div className="flow-host" ref={hostRef}>
      <ReactFlow
        // Новая карта — новый экземпляр: fitView кадрирует её, а не камера прошлой карты
        key={doc.revision}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          const el = hostRef.current;
          const canvas = { width: el?.clientWidth ?? 1280, height: el?.clientHeight ?? 800 };
          const start = startViewport(packed, boxes, canvas, START_ZOOM);
          applyZoomStyle(el, start.zoom);
          void instance.setViewport(start);
        }}
        {...zoom}
        onlyRenderVisibleElements
        minZoom={0.05}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => selectPage(null)}
        onNodeClick={(_, n) => {
          if (n.type !== 'groupFrame') {
            selectPage(n.id);
          }
        }}
      >
        <RevealSelected />
        {/* Точки в мировых координатах сцены: pan/zoom двигает их вместе с нодами */}
        <Background
          id="lam-scene-dots"
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.25}
          color="var(--canvas-dot)"
        />
        <LamMiniMap size={miniSize} groupOrder={groupOrder} selectedPageId={selectedPageId} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

/**
 * Холст React Flow: layout страниц, поиск, empty state при нуле совпадений.
 */
export function AppMapCanvas() {
  const document = useAppStore((s) => s.document);
  const view = useCanvasView();
  if (!document || view === null) {
    return null;
  }
  return view.kind === 'miss' ? <SearchMiss query={view.query} /> : <FlowCanvas doc={document} graph={view.graph} />;
}
