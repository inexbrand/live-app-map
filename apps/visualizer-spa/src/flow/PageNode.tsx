/**
 * Нода карты: live iframe, размер окна (адаптив), лог load/error.
 * Части — в flow/page-node: sandbox, шапка, строка пути, живой экран, панель окна, стейты, хуки.
 */
import type { AppMapNode, AppMapPageState, DeviceViewport } from '@live-app-map/schema';
import type { NodeLayoutMetrics } from '../lib/node-layout';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState, type RefObject } from 'react';
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
    isDim: useAppStore((s) => s.highlightedPageIds.size > 0 && !s.highlightedPageIds.has(id) && s.selectedPageId !== id),
    isPinned: useAppStore((s) => s.pinnedPageIds.has(id)),
    isLive: useAppStore((s) => s.livePageIds.has(id)) && live,
    isWarm: useAppStore((s) => s.warmPageIds.has(id)) && live,
    isMounted: useAppStore((s) => s.mountedPageIds.has(id)) && live,
    inViewport: useAppStore((s) => s.visiblePageIds.has(id)),
    isInteract: useAppStore((s) => s.interactPageId === id),
    // Выбор компонента для замечания: страница должна получать мышь
    picking: useSnapshotStore((s) => isElementPick(s.session)),
    openComments: useCommentsStore((s) => s.threads.reduce((n, t) => (t.anchor.pageId === id && t.status === 'open' ? n + 1 : n), 0)),
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

/** Sandbox iframe: адрес прокси свой, иначе dogfood-хост или baseUrl карты. */
function useSandbox(url: string | null) {
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const documentBaseUrl = useAppStore((s) => s.document?.baseUrl ?? '');
  const hintUrl = url ?? (baseUrlOverride.trim() !== '' ? baseUrlOverride : documentBaseUrl);
  const preset = resolveIframeSandboxPreset(hintUrl);
  return { preset, value: sandboxAttrForPreset(preset), note: sandboxPresetLabel(preset) };
}

/** Снимок есть только у адресов шлюза: его снимает сервер под тем же профилем. */
function gatewaySnapshotOf(url: string | null, gatewayPort: number | null, viewport: ResolvedViewport): string | null {
  return url !== null && gatewayPort !== null && url.includes(`.localhost:${gatewayPort}/`) ? snapshotSrc(url, viewport.width, viewport.height) : null;
}

/**
 * Что показать в теле ноды.
 *
 * @param gatewayPort - порт шлюза; null — снимка нет (шлюза нет или снимок не удался)
 */
function bodyOf(f: PageFlags, url: string | null, viewport: ResolvedViewport, gatewayPort: number | null) {
  // placeholder только если iframe реально нет (холодный слот)
  const placeholder = resolvePagePlaceholder({ mode: f.mode, hasUrl: Boolean(url), iframeError: false, inViewport: f.inViewport, isPinned: f.isPinned, isWarm: false });
  // Keep-alive: mounted = live ∪ warm — не unmount, state SPA сохраняется
  const liveUrl = f.isMounted ? url : null;
  const gatewaySnapshot = f.mode === 'live' ? gatewaySnapshotOf(url, gatewayPort, viewport) : null;
  return { placeholder, liveUrl, gatewaySnapshot, snapshot: liveUrl === null ? gatewaySnapshot : null };
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

/** Замер высоты страницы в iframe — только при heightMode=auto. */
function useMeasure(id: string, viewport: ResolvedViewport, iframeRef: RefObject<HTMLIFrameElement | null>): () => void {
  const setContentHeight = useAppStore((s) => s.setContentHeight);
  return () => {
    // Размер layout — из JSON fixed; measure только при explicit auto
    if (viewport.heightMode !== 'auto') {
      return;
    }
    const h = measureIframeContentHeight(iframeRef.current);
    if (h !== null) {
      setContentHeight(id, h);
    }
  };
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
function useViewportActions(node: AppMapNode, viewport: ResolvedViewport, measure: () => void) {
  const setNodeViewport = useAppStore((s) => s.setNodeViewport);
  const override = useAppStore((s) => s.nodeViewports.get(node.id));
  const mapLayout = useAppStore((s) => s.document?.layout);
  const applyPreset = (p: ViewportPreset): void => {
    const next: DeviceViewport = { width: p.width, height: p.height, label: p.label, heightMode: p.heightMode ?? 'auto' };
    setNodeViewport(node.id, next);
    // width сменился — re-measure после reload iframe
    window.setTimeout(() => measure(), 400);
  };
  const toggleFullHeight = (): void => {
    // Обратно в окно — высота без замера страницы (та, что была до «целиком»).
    const windowHeight = resolveNodeViewport({ nodeViewport: node.viewport, override, layout: mapLayout, measuredHeight: undefined }).height;
    setNodeViewport(node.id, viewport.heightMode === 'auto' ? { ...viewport, height: windowHeight, heightMode: 'fixed' } : { ...viewport, heightMode: 'auto' });
  };
  return { applyPreset, toggleFullHeight };
}

/** Загрузка iframe: запись в лог и замеры высоты после кадра и с задержками. */
function useFrameLoad(node: AppMapNode, url: string | null, viewport: ResolvedViewport, measure: () => void): () => void {
  const pushLog = useAppStore((s) => s.pushLog);
  return () => {
    pushLog({
      level: 'info',
      source: node.id,
      message: `iframe load ${viewport.width}×${viewport.height}${viewport.heightMode === 'auto' ? ' auto' : ''} · ${url}`,
    });
    // measure полной высоты страницы (same-origin / proxy)
    window.requestAnimationFrame(() => {
      measure();
      window.setTimeout(() => measure(), 350);
      window.setTimeout(() => measure(), 1200);
    });
  };
}

/** Замороженная нода: снимок вместо живого iframe — память вкладки не растёт. */
function FrozenSnapshot({ src, title, viewport, layout, onError }: { readonly src: string; readonly title: string; readonly viewport: ResolvedViewport; readonly layout: NodeLayoutMetrics; readonly onError: () => void }) {
  return (
    <img
      data-lam-snapshot
      className="page-node__snapshot"
      src={src}
      alt={`Снимок: ${title}`}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onError}
      style={{
        width: viewport.width,
        height: viewport.height,
        transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`,
        transformOrigin: '0 0',
      }}
    />
  );
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

/** Содержимое тела: живой экран, снимок или заглушка. */
function NodeView({ liveUrl, snapshot, placeholder, live, frozen }: { readonly liveUrl: string | null; readonly snapshot: string | null; readonly placeholder: string; readonly live: React.ReactNode; readonly frozen: React.ReactNode }) {
  if (liveUrl) {
    return live;
  }
  if (snapshot !== null) {
    return frozen;
  }
  return (
    <div className="page-node__placeholder" role="status">
      {placeholder}
    </div>
  );
}

function PageNodeInner(props: NodeProps<PageFlowNode>) {
  const node = props.data.node;
  const f = usePageFlags(node.id);
  const scale = useAppStore((s) => s.iframeScale);
  const selectPage = useAppStore((s) => s.selectPage);
  const setInteract = useAppStore((s) => s.setInteract);
  const report = useGatewayStore((s) => s.reports.get(node.id));
  const { url, gatewayPort } = useLiveUrl(node.id);
  const sandbox = useSandbox(url);

  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);

  const viewport = useNodeViewport(node);
  const status = pageStatus(f.isMounted ? report : undefined, viewport.height);
  const layout = computeNodeLayout(viewport, scale, { selected: f.isSelected });
  const measure = useMeasure(node.id, viewport, iframeRef);
  const actions = useViewportActions(node, viewport, measure);
  const onFrameLoad = useFrameLoad(node, url, viewport, measure);
  const onResizePointerDown = useNodeResize(node.id, viewport, scale, measure);

  useNodeVisibility(bodyRef, node.id);
  useWheelToPage(bodyRef, iframeRef, status.cropped !== null, viewport.width);
  useReportedHeight(node.id, status.contentHeight, viewport.heightMode);

  const { placeholder, liveUrl, gatewaySnapshot, snapshot } = bodyOf(f, url, viewport, snapshotFailed ? null : gatewayPort);

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
    >
      <Handle type="target" position={Position.Left} />
      <div className="page-node__header">
        <div className="page-node__title" title={node.title}>{node.title}</div>
        <NodeActions nodeId={node.id} isPinned={f.isPinned} />
      </div>
      {/* Состояние — строкой пути: в шапке узкой ноды значки выдавливали заголовок. */}
      <NodePath node={node} url={url} status={status} openComments={f.openComments} isLive={f.isLive} isWarm={f.isWarm} viewport={viewport} />
      <div
        className="page-node__body"
        ref={bodyRef}
        data-page-id={node.id}
        data-lam-preview-body
        title={sandbox.note}
        style={{
          width: layout.contentWidth,
          height: layout.contentHeight,
          flex: '0 0 auto',
        }}
      >
        <NodeView
          liveUrl={liveUrl}
          snapshot={snapshot}
          placeholder={placeholder}
          frozen={<FrozenSnapshot src={snapshot ?? ''} title={node.title} viewport={viewport} layout={layout} onError={() => setSnapshotFailed(true)} />}
          live={<LiveFrame
            node={node}
            url={liveUrl ?? ''}
            viewport={viewport}
            layout={layout}
            sandboxPreset={sandbox.preset}
            sandboxValue={sandbox.value}
            gatewaySnapshot={gatewaySnapshot}
            isInteract={f.isInteract}
            picking={f.picking}
            iframeDimmed={f.isWarm && !f.isLive}
            iframeRef={iframeRef}
            onSnapshotError={() => setSnapshotFailed(true)}
            onLoad={onFrameLoad}
          />}
        />
        {liveUrl || snapshot !== null ? <CommentMarkers nodeId={node.id} scaleX={layout.iframeScaleX} scaleY={layout.iframeScaleY} /> : null}
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
