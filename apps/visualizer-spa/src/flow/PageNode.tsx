/**
 * Нода карты: live iframe, размер окна (адаптив), лог load/error.
 * Части — в flow/page-node: sandbox, шапка, строка пути, живой экран, панель окна, стейты, хуки.
 */
import type { AppMapNode, AppMapPageState, DeviceViewport } from '@live-app-map/schema';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { CommentMarkers } from '../components/comments/CommentMarkers';
import { pageStatus } from '../lib/gateway/page-status';
import { snapshotSrc } from '../lib/gateway/snapshot-url';
import { measureIframeContentHeight } from '../lib/measure-iframe-height';
import { computeNodeLayout } from '../lib/node-layout';
import { MAX_CONTENT_HEIGHT, resolveNodeViewport, type ViewportPreset } from '../lib/viewport';
import { resolveViewportPresets } from '../lib/viewport-presets';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { useGatewayStore } from '../store/gateway-store';
import { isElementPick, useSnapshotStore } from '../store/snapshot-store';
import { LiveFrame } from './page-node/LiveFrame';
import { NodeActions } from './page-node/NodeActions';
import { NodePath } from './page-node/NodePath';
import { resolveIframeSandboxPreset, resolvePagePlaceholder, sandboxAttrForPreset, sandboxPresetLabel } from './page-node/sandbox';
import { StateChips } from './page-node/StateChips';
import { useNodeResize } from './page-node/use-node-resize';
import { useNodeVisibility } from './page-node/use-node-visibility';
import { useWheelToPage } from './page-node/use-wheel-to-page';
import { ViewportBar } from './page-node/ViewportBar';

export {
  isTrustedIframeBaseUrl,
  resolveIframeSandboxPreset,
  resolvePagePlaceholder,
  SANDBOX_STRICT,
  SANDBOX_TRUSTED,
  sandboxAttrForPreset,
  sandboxPresetLabel,
  type IframeSandboxPreset,
} from './page-node/sandbox';

export type PageNodeData = {
  readonly node: AppMapNode;
};

export type PageFlowNode = Node<PageNodeData, 'page'>;

function PageNodeInner(props: NodeProps<PageFlowNode>) {
  const node = props.data.node;
  // Подписки — на признаки этой ноды, а не на целые наборы: смена live/visible
  // у одной ноды не перерисовывает остальные сотни.
  const isSelected = useAppStore((s) => s.selectedPageId === node.id);
  const isDim = useAppStore((s) => s.highlightedPageIds.size > 0 && !s.highlightedPageIds.has(node.id) && s.selectedPageId !== node.id);
  const isPinned = useAppStore((s) => s.pinnedPageIds.has(node.id));
  const inLive = useAppStore((s) => s.livePageIds.has(node.id));
  const inWarm = useAppStore((s) => s.warmPageIds.has(node.id));
  const inMounted = useAppStore((s) => s.mountedPageIds.has(node.id));
  const inViewport = useAppStore((s) => s.visiblePageIds.has(node.id));
  const mode = useAppStore((s) => s.mode);
  const scale = useAppStore((s) => s.iframeScale);
  const isInteract = useAppStore((s) => s.interactPageId === node.id);
  // Выбор компонента для замечания: страница должна получать мышь
  const picking = useSnapshotStore((s) => isElementPick(s.session));
  const openComments = useCommentsStore((s) => s.threads.reduce((n, t) => (t.anchor.pageId === node.id && t.status === 'open' ? n + 1 : n), 0));
  const activeStateName = useAppStore((s) => s.activeStates.get(node.id));
  const override = useAppStore((s) => s.nodeViewports.get(node.id));
  const measuredHeight = useAppStore((s) => s.contentHeights.get(node.id));
  const mapLayout = useAppStore((s) => s.document?.layout);
  const selectPage = useAppStore((s) => s.selectPage);
  const applyPageState = useAppStore((s) => s.applyPageState);
  const setInteract = useAppStore((s) => s.setInteract);
  const setNodeViewport = useAppStore((s) => s.setNodeViewport);
  const setContentHeight = useAppStore((s) => s.setContentHeight);
  const pushLog = useAppStore((s) => s.pushLog);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const documentBaseUrl = useAppStore((s) => s.document?.baseUrl ?? '');
  // Порт и профили шлюза входят в адрес: подписка перестраивает его при входе.
  const gatewayPort = useGatewayStore((s) => s.port);
  useGatewayStore((s) => s.profiles);
  useGatewayStore((s) => s.samples);
  const report = useGatewayStore((s) => s.reports.get(node.id));
  const url = useAppStore((s) => s.resolveLiveUrl(node.id));

  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState(false);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const isLive = inLive && mode === 'live';
  const isWarm = inWarm && mode === 'live';
  const isMounted = inMounted && mode === 'live';

  const viewport = resolveNodeViewport({
    nodeViewport: node.viewport,
    override,
    layout: mapLayout,
    measuredHeight,
  });
  const status = pageStatus(isMounted ? report : undefined, viewport.height);
  const layout = computeNodeLayout(viewport, scale, { selected: isSelected });
  const widthPresets = resolveViewportPresets(mapLayout);

  const applyMeasuredHeight = () => {
    // Размер layout — из JSON fixed; measure только при explicit auto
    if (viewport.heightMode !== 'auto') {
      return;
    }
    const h = measureIframeContentHeight(iframeRef.current);
    if (h !== null) {
      setContentHeight(node.id, h);
    }
  };

  // Sandbox trust: proxy URL same-origin, иначе dogfood host / baseUrl
  const sandboxHintUrl =
    url ??
    (baseUrlOverride.trim() !== '' ? baseUrlOverride : documentBaseUrl);
  const sandboxPreset = resolveIframeSandboxPreset(sandboxHintUrl);
  const sandboxValue = sandboxAttrForPreset(sandboxPreset);
  const sandboxNote = sandboxPresetLabel(sandboxPreset);

  useEffect(() => {
    setIframeError(false);
  }, [url, viewport.width, viewport.height]);

  useNodeVisibility(bodyRef, node.id);
  useWheelToPage(bodyRef, iframeRef, status.cropped !== null, viewport.width);

  // Во всю высоту (heightMode=auto): высота из отчёта шлюза — страница кросс-доменная.
  const reportedHeight = status.contentHeight;
  useEffect(() => {
    if (viewport.heightMode === 'auto' && reportedHeight !== null && reportedHeight >= 120) {
      setContentHeight(node.id, Math.min(MAX_CONTENT_HEIGHT, reportedHeight));
    }
  }, [node.id, reportedHeight, viewport.heightMode, setContentHeight]);

  const onState = (st: AppMapPageState) => {
    if (activeStateName === st.name) {
      applyPageState(node.id, null);
    } else {
      applyPageState(node.id, st);
    }
  };

  const placeholder = resolvePagePlaceholder({
    mode,
    hasUrl: Boolean(url),
    iframeError,
    inViewport,
    isPinned,
    // placeholder только если iframe реально нет (холодный слот)
    isWarm: false,
  });

  // Keep-alive: mounted = live ∪ warm — не unmount, state SPA сохраняется
  const showIframe = isMounted && url && !iframeError;
  // Снимок есть только у адресов шлюза: его снимает сервер под тем же профилем.
  const gatewaySnapshot =
    mode === 'live' && url !== null && gatewayPort !== null && !snapshotFailed && url.includes(`.localhost:${gatewayPort}/`)
      ? snapshotSrc(url, viewport.width, viewport.height)
      : null;
  const snapshot = showIframe ? null : gatewaySnapshot;
  /** Warm вне live: держим DOM, visually «приглушён» если не в кадре */
  const iframeDimmed = isWarm && !isLive;

  const applyPreset = (p: ViewportPreset) => {
    const next: DeviceViewport = {
      width: p.width,
      height: p.height,
      label: p.label,
      heightMode: p.heightMode ?? 'auto',
    };
    setNodeViewport(node.id, next);
    // width сменился — re-measure после reload iframe
    window.setTimeout(() => applyMeasuredHeight(), 400);
  };

  const onResizePointerDown = useNodeResize(node.id, viewport, scale, applyMeasuredHeight);

  const toggleFullHeight = () => {
    // Обратно в окно — высота без замера страницы (та, что была до «целиком»).
    const windowHeight = resolveNodeViewport({ nodeViewport: node.viewport, override, layout: mapLayout, measuredHeight: undefined }).height;
    setNodeViewport(node.id, viewport.heightMode === 'auto' ? { ...viewport, height: windowHeight, heightMode: 'fixed' } : { ...viewport, heightMode: 'auto' });
  };

  const onFrameLoad = () => {
    setIframeError(false);
    pushLog({
      level: 'info',
      source: node.id,
      message: `iframe load ${viewport.width}×${viewport.height}${viewport.heightMode === 'auto' ? ' auto' : ''} · ${url}`,
    });
    // measure полной высоты страницы (same-origin / proxy)
    window.requestAnimationFrame(() => {
      applyMeasuredHeight();
      window.setTimeout(() => applyMeasuredHeight(), 350);
      window.setTimeout(() => applyMeasuredHeight(), 1200);
    });
  };

  const onFrameError = () => {
    setIframeError(true);
    pushLog({
      level: 'error',
      source: node.id,
      message: `iframe error · ${url ?? 'no url'}`,
    });
  };

  return (
    <div
      className={`page-node${isSelected ? ' page-node--selected' : ''}${isDim ? ' page-node--dim' : ''}${isWarm && !isLive ? ' page-node--warm' : ''}${isLive ? ' page-node--live' : ''}`}
      style={{ width: '100%', height: '100%' }}
      data-page-id={node.id}
      data-lam-node={node.id}
      data-lam-live={isLive ? '1' : '0'}
      data-lam-warm={isWarm ? '1' : '0'}
      data-lam-mounted={isMounted ? '1' : '0'}
      data-lam-outer-w={layout.outerWidth}
      data-lam-outer-h={layout.outerHeight}
      data-lam-content-w={layout.contentWidth}
      data-lam-content-h={layout.contentHeight}
      onClick={() => selectPage(node.id)}
      onDoubleClick={() => setInteract(node.id)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="page-node__header">
        <div className="page-node__title" title={node.title}>{node.title}</div>
        <NodeActions nodeId={node.id} isPinned={isPinned} />
      </div>
      {/* Состояние — строкой пути: в шапке узкой ноды значки выдавливали заголовок. */}
      <NodePath node={node} url={url} status={status} openComments={openComments} isLive={isLive} isWarm={isWarm} viewport={viewport} />
      <div
        className="page-node__body"
        ref={bodyRef}
        data-page-id={node.id}
        data-lam-preview-body
        title={sandboxNote}
        style={{
          width: layout.contentWidth,
          height: layout.contentHeight,
          flex: '0 0 auto',
        }}
      >
        {showIframe ? (
          <LiveFrame
            node={node}
            url={url}
            viewport={viewport}
            layout={layout}
            sandboxPreset={sandboxPreset}
            sandboxValue={sandboxValue}
            gatewaySnapshot={gatewaySnapshot}
            isInteract={isInteract}
            picking={picking}
            iframeDimmed={iframeDimmed}
            iframeRef={iframeRef}
            onSnapshotError={() => setSnapshotFailed(true)}
            onLoad={onFrameLoad}
            onError={onFrameError}
          />
        ) : snapshot !== null ? (
          // Замороженная нода: снимок вместо живого iframe — память вкладки не растёт.
          <img
            data-lam-snapshot
            className="page-node__snapshot"
            src={snapshot}
            alt={`Снимок: ${node.title}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setSnapshotFailed(true)}
            style={{
              width: viewport.width,
              height: viewport.height,
              transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`,
              transformOrigin: '0 0',
            }}
          />
        ) : (
          <div className="page-node__placeholder" role="status">
            {placeholder}
          </div>
        )}
        {showIframe || snapshot !== null ? <CommentMarkers nodeId={node.id} scaleX={layout.iframeScaleX} scaleY={layout.iframeScaleY} /> : null}
        <div
          className="page-node__resize"
          title="Ширина (Shift — free height / fixed)"
          onPointerDown={onResizePointerDown}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {isSelected ? (
        <ViewportBar viewport={viewport} presets={widthPresets} applyPreset={applyPreset} toggleFullHeight={toggleFullHeight} />
      ) : node.states && node.states.length > 0 ? (
        <StateChips states={node.states} activeStateName={activeStateName} onState={onState} />
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const PageNode = memo(PageNodeInner);
