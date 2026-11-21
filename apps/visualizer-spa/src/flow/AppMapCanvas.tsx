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
import { useMemo, useRef } from 'react';
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

/** Пауза после зума, после которой живые iframe возвращаются, мс. */
const ZOOM_SETTLE_MS = 250;
const nodeTypes = { page: PageNode, service: ServiceNode, groupFrame: GroupFrameNode };

/** Стартовый масштаб: не мельче — иначе подписи нод не читаются. */
const START_ZOOM = { min: 0.75, max: 1 };

export { filterCanvasGraph, type CanvasGraphFilterResult } from './canvas-graph';

/**
 * Холст React Flow: layout страниц, поиск, empty state при нуле совпадений.
 */
export function AppMapCanvas() {
  const document = useAppStore((s) => s.document);
  const selectPage = useAppStore((s) => s.selectPage);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const nodeViewports = useAppStore((s) => s.nodeViewports);
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const contentHeights = useAppStore((s) => s.contentHeights);
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomAtStart = useRef(1);
  const zoomIdle = useRef(0);

  const { nodes, edges, isSearchMiss, displayQuery, packed, boxes } = useMemo(() => {
    const empty: { packed: PackedLayout; boxes: LayoutBox[] } = { packed: { positions: new Map(), groups: [] }, boxes: [] };
    if (!document) {
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        isSearchMiss: false,
        displayQuery: '',
        ...empty,
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
        ...empty,
      };
    }

    const { boxes, packed } = layoutCanvas(document, filtered, navEdges, { iframeScale, nodeViewports, contentHeights });
    const positions = packed.positions;
    const frames: Node[] = packed.groups.map((g) => ({
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
    const nodes: Node[] = filtered.map((n) => {
      const pos = positions.get(n.id);
      if (n.kind === 'service') {
        return {
          id: n.id,
          type: 'service',
          position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
          ...SERVICE_NODE_SIZE,
          style: { ...SERVICE_NODE_SIZE },
          data: { node: n } satisfies ServiceNodeData,
        };
      }
      // Тот же расчёт, что в PageNode: размер ноды React Flow = размер DOM
      const layout = canvasNodeSize(document, n, { iframeScale, nodeViewports, contentHeights }, selectedPageId === n.id);
      return {
        id: n.id,
        type: 'page',
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        // xyflow: width/height + style — один math с PageNode DOM
        width: layout.outerWidth,
        height: layout.outerHeight,
        style: {
          width: layout.outerWidth,
          height: layout.outerHeight,
        },
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
        // Вызовы API экрана — пунктиром, чтобы не путать с навигацией.
        style: e.kind === 'api' ? { stroke: 'var(--edge-api)', strokeDasharray: '4 4' } : { stroke: 'var(--edge)' },
      };
    });
    return {
      nodes: [...frames, ...nodes],
      edges,
      isSearchMiss: false,
      displayQuery: searchQuery.trim(),
      packed,
      boxes,
    };
  }, [document, searchQuery, iframeScale, nodeViewports, contentHeights, selectedPageId]);

  const miniSize = useMemo(
    () => minimapSize(layoutBounds(nodes.map((n) => ({ x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 })))),
    [nodes],
  );
  const groupOrder = useMemo(() => (document?.groups ?? []).map((g) => g.id), [document]);

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

  return (
    <div className="flow-host" ref={hostRef}>
      <ReactFlow
        // Новая карта — новый экземпляр: fitView кадрирует её, а не камера прошлой карты
        key={document.revision}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          const el = hostRef.current;
          const canvas = { width: el?.clientWidth ?? 1280, height: el?.clientHeight ?? 800 };
          void instance.setViewport(startViewport(packed, boxes, canvas, START_ZOOM));
        }}
        // Зум: живые iframe прячутся под свой снимок — пересборка их слоёв на каждом кадре стоила ~10 кадров/с.
        onMoveStart={(_, vp) => {
          zoomAtStart.current = vp.zoom;
        }}
        onMove={(_, vp) => {
          if (vp.zoom !== zoomAtStart.current) {
            window.clearTimeout(zoomIdle.current);
            hostRef.current?.classList.add('flow-host--zooming');
          }
        }}
        onMoveEnd={() => {
          // Показ iframe дорогой: между шагами колеса не возвращаем, ждём паузу.
          window.clearTimeout(zoomIdle.current);
          zoomIdle.current = window.setTimeout(() => hostRef.current?.classList.remove('flow-host--zooming'), ZOOM_SETTLE_MS);
        }}
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
