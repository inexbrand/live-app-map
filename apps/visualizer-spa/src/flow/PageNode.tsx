/**
 * Нода карты: экран из трансляции, размер окна (адаптив).
 * Части — в flow/page-node: шапка, строка пути, экран, панель окна, стейты, хуки.
 */
import type { AppMapNode, AppMapPageState, DeviceViewport } from '@live-app-map/schema';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { CommentMarkers } from '../components/comments/CommentMarkers';
import { pageStatus } from '../lib/gateway/page-status';
import { snapshotSrc } from '../lib/gateway/snapshot-url';
import { computeNodeLayout } from '../lib/node-layout';
import { MAX_CONTENT_HEIGHT, resolveNodeViewport, type ViewportPreset } from '../lib/viewport';
import { resolveViewportPresets } from '../lib/viewport-presets';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { useGatewayStore } from '../store/gateway-store';
import { NodeTop } from './page-node/NodeTop';
import { ScreenView } from './page-node/ScreenView';
import { StateChips } from './page-node/StateChips';
import { useNodeResize } from './page-node/use-node-resize';
import { useNodeVisibility } from './page-node/use-node-visibility';
import { useWheelToPage } from './page-node/use-wheel-to-page';
import { ViewportBar } from './page-node/ViewportBar';

/** Окно ноды после всех правок. */
type ResolvedViewport = DeviceViewport;

export type PageNodeData = {
  readonly node: AppMapNode;
};

export type PageFlowNode = Node<PageNodeData, 'page'>;

/** Признаки ноды из store; подписки — на эту ноду, а не на целые наборы. */
function usePageFlags(id: string) {
  const mode = useAppStore((s) => s.mode);
  const live = mode === 'live';
  return {
    mode,
    isSelected: useAppStore((s) => s.selectedPageId === id),
    // Фокус экрана: остальные гаснут
    isDim: useAppStore((s) => s.selectedPageId !== null && s.selectedPageId !== id),
    isPinned: useAppStore((s) => s.pinnedPageIds.has(id)),
    isLive: useAppStore((s) => s.livePageIds.has(id)) && live,
    isWarm: useAppStore((s) => s.warmPageIds.has(id)) && live,
    isMounted: useAppStore((s) => s.mountedPageIds.has(id)) && live,
    inViewport: useAppStore((s) => s.visiblePageIds.has(id)),
    isInteract: useAppStore((s) => s.interactPageId === id),
    openComments: useCommentsStore((s) => s.threads.reduce((n, t) => (t.anchor.pageId === id && t.stage !== 'done' ? n + 1 : n), 0)),
  };
}

type PageFlags = ReturnType<typeof usePageFlags>;

/** Окно ноды: из ноды, правки пользователя, раскладки карты и замера. */
function useNodeViewport(node: AppMapNode): ResolvedViewport {
  const override = useAppStore((s) => s.nodeViewports.get(node.id));
  const measuredHeight = useAppStore((s) => s.contentHeights.get(node.id));
  const mapLayout = useAppStore((s) => s.document?.layout);
  return resolveNodeViewport({ nodeViewport: node.viewport, override, layout: mapLayout, measuredHeight });
}

/** Адрес живого экрана; порт и профили шлюза входят в адрес — подписка перестраивает его при входе. */
function useLiveUrl(id: string): { readonly url: string | null; readonly gatewayPort: number | null } {
  const gatewayPort = useGatewayStore((s) => s.port);
  useGatewayStore((s) => s.profiles);
  useGatewayStore((s) => s.samples);
  const url = useAppStore((s) => s.resolveLiveUrl(id));
  return { url, gatewayPort };
}

/** Снимок есть только у адресов шлюза: его снимает сервер под тем же профилем. */
function gatewaySnapshotOf(url: string | null, gatewayPort: number | null, viewport: ResolvedViewport): string | null {
  return url !== null && gatewayPort !== null && url.includes(`.localhost:${gatewayPort}/`) ? snapshotSrc(url, viewport.width, viewport.height) : null;
}

/** Подпись вместо экрана, когда показывать нечего. */
function placeholderOf(mode: PageFlags['mode']): string {
  if (mode === 'live') {
    return 'Нет адреса экрана';
  }
  return mode === 'compact' ? 'Компакт' : 'Только карта';
}

/** Классы ноды по её признакам. */
function nodeClassName(f: PageFlags): string {
  const parts = ['page-node'];
  if (f.isSelected) {
    parts.push('page-node--selected');
  }
  if (f.isDim) {
    parts.push('page-node--dim');
  }
  if (f.isWarm && !f.isLive) {
    parts.push('page-node--warm');
  }
  if (f.isLive) {
    parts.push('page-node--live');
  }
  return parts.join(' ');
}

/** Во всю высоту (heightMode=auto): высота из отчёта шлюза — страница кросс-доменная. */
function useReportedHeight(id: string, reportedHeight: number | null, heightMode: ResolvedViewport['heightMode']): void {
  const setContentHeight = useAppStore((s) => s.setContentHeight);
  useEffect(() => {
    if (heightMode === 'auto' && reportedHeight !== null && reportedHeight >= 120) {
      setContentHeight(id, Math.min(MAX_CONTENT_HEIGHT, reportedHeight));
    }
  }, [id, reportedHeight, heightMode, setContentHeight]);
}

/** Действия окна ноды: пресет ширины и «целиком» ↔ окно. */
function useViewportActions(node: AppMapNode, viewport: ResolvedViewport) {
  const setNodeViewport = useAppStore((s) => s.setNodeViewport);
  const override = useAppStore((s) => s.nodeViewports.get(node.id));
  const mapLayout = useAppStore((s) => s.document?.layout);
  const applyPreset = (p: ViewportPreset): void => {
    const next: DeviceViewport = { width: p.width, height: p.height, label: p.label, heightMode: p.heightMode ?? 'auto' };
    // Высоту при auto пришлёт отчёт страницы после смены окна
    setNodeViewport(node.id, next);
  };
  const toggleFullHeight = (): void => {
    // Обратно в окно — высота без замера страницы (та, что была до «целиком»).
    const windowHeight = resolveNodeViewport({ nodeViewport: node.viewport, override, layout: mapLayout, measuredHeight: undefined }).height;
    setNodeViewport(node.id, viewport.heightMode === 'auto' ? { ...viewport, height: windowHeight, heightMode: 'fixed' } : { ...viewport, heightMode: 'auto' });
  };
  return { applyPreset, toggleFullHeight };
}

/** Низ ноды: у выбранной — размеры окна, иначе стейты экрана (если есть). */
function NodeFooter({ node, isSelected, viewport, actions }: { readonly node: AppMapNode; readonly isSelected: boolean; readonly viewport: ResolvedViewport; readonly actions: ReturnType<typeof useViewportActions> }) {
  const activeStateName = useAppStore((s) => s.activeStates.get(node.id));
  const mapLayout = useAppStore((s) => s.document?.layout);
  const applyPageState = useAppStore((s) => s.applyPageState);
  if (isSelected) {
    return <ViewportBar viewport={viewport} presets={resolveViewportPresets(mapLayout)} applyPreset={actions.applyPreset} toggleFullHeight={actions.toggleFullHeight} />;
  }
  if (!node.states || node.states.length === 0) {
    return null;
  }
  const onState = (st: AppMapPageState): void => applyPageState(node.id, activeStateName === st.name ? null : st);
  return <StateChips states={node.states} activeStateName={activeStateName} onState={onState} />;
}

/** data-атрибуты состояния ноды для e2e и стилей. */
function flagAttrs(f: PageFlags): Record<string, string> {
  return { 'data-lam-live': f.isLive ? '1' : '0', 'data-lam-warm': f.isWarm ? '1' : '0', 'data-lam-mounted': f.isMounted ? '1' : '0' };
}

function PageNodeInner(props: NodeProps<PageFlowNode>) {
  const node = props.data.node;
  const f = usePageFlags(node.id);
  const scale = useAppStore((s) => s.iframeScale);
  const selectPage = useAppStore((s) => s.selectPage);
  const setInteract = useAppStore((s) => s.setInteract);
  const report = useGatewayStore((s) => s.reports.get(node.id));
  const { url, gatewayPort } = useLiveUrl(node.id);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  // Кнопки шапки — только под мышью и у выбранной: в покое карточка — название и путь
  const [hovered, setHovered] = useState(false);
  const showChrome = f.isSelected || hovered;

  const viewport = useNodeViewport(node);
  const status = pageStatus(f.isMounted ? report : undefined, viewport.height);
  const layout = computeNodeLayout(viewport, scale, { selected: f.isSelected });
  const actions = useViewportActions(node, viewport);
  const onResizePointerDown = useNodeResize(node.id, viewport, scale);

  useNodeVisibility(bodyRef, node.id);
  useWheelToPage(bodyRef, node.id, status.cropped !== null, viewport.width);
  useReportedHeight(node.id, status.contentHeight, viewport.heightMode);

  const snapshot = f.mode === 'live' ? gatewaySnapshotOf(url, snapshotFailed ? null : gatewayPort, viewport) : null;
  const showScreen = f.mode === 'live' && url !== null;

  return (
    <div
      className={nodeClassName(f)}
      style={{ width: '100%', height: '100%' }}
      data-page-id={node.id}
      data-lam-node={node.id}
      {...flagAttrs(f)}
      data-lam-outer-w={layout.outerWidth}
      data-lam-outer-h={layout.outerHeight}
      data-lam-content-w={layout.contentWidth}
      data-lam-content-h={layout.contentHeight}
      onClick={() => selectPage(node.id)}
      onDoubleClick={() => setInteract(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} />
      <NodeTop node={node} url={url} status={status} viewport={viewport} chrome={showChrome} selected={f.isSelected} isPinned={f.isPinned} openComments={f.openComments} />
      <div
        className="page-node__body"
        ref={bodyRef}
        data-page-id={node.id}
        data-lam-preview-body
        style={{
          width: layout.contentWidth,
          height: layout.contentHeight,
          flex: '0 0 auto',
        }}
      >
        {showScreen ? (
          <ScreenView
            nodeId={node.id}
            title={node.title}
            viewport={viewport}
            layout={layout}
            mounted={f.isMounted}
            interactive={f.isSelected || f.isInteract}
            snapshot={snapshot}
            onSnapshotError={() => setSnapshotFailed(true)}
          />
        ) : (
          <div className="page-node__placeholder" role="status">
            {placeholderOf(f.mode)}
          </div>
        )}
        {showScreen ? <CommentMarkers nodeId={node.id} scaleX={layout.iframeScaleX} scaleY={layout.iframeScaleY} /> : null}
        <div
          className="page-node__resize"
          title="Ширина (Shift — free height / fixed)"
          onPointerDown={onResizePointerDown}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <NodeFooter node={node} isSelected={f.isSelected} viewport={viewport} actions={actions} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const PageNode = memo(PageNodeInner);
