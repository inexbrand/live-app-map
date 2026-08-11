/**
 * Нода карты: live iframe, размер окна (адаптив), лог load/error.
 */
import type { AppMapNode, AppMapPageState, DeviceViewport } from '@live-app-map/schema';
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ExternalLink,
  Pin,
  PinOff,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  measureIframeContentHeight,
} from '../lib/measure-iframe-height';
import {
  computeNodeLayout,
  resolveNodeViewport,
  resolveViewportPresets,
} from '../lib/viewport';
import { Badge, Chip } from '../ui';
import { useAppStore } from '../store/app-store';

export type PageNodeData = {
  readonly node: AppMapNode;
};

export type PageFlowNode = Node<PageNodeData, 'page'>;

export type IframeSandboxPreset = 'strict' | 'trusted';

export const SANDBOX_TRUSTED =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';

export const SANDBOX_STRICT =
  'allow-scripts allow-forms allow-popups allow-modals';

export function isTrustedIframeBaseUrl(baseUrl: string | null | undefined): boolean {
  if (baseUrl === null || baseUrl === undefined) {
    return false;
  }
  const trimmed = baseUrl.trim();
  if (trimmed === '') {
    return false;
  }
  // Same-origin Vite TLS proxy (self-signed target, secure:false)
  if (
    trimmed.includes('/__lam_proxy/miniapp') ||
    trimmed.includes('/__lam_proxy/admin') ||
    trimmed.includes('/__lam_proxy/site') ||
    trimmed.includes('/__lam_proxy/https/')
  ) {
    return true;
  }
  try {
    const host = new URL(
      trimmed,
      typeof location !== 'undefined' ? location.href : 'http://localhost',
    ).hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1'
    ) {
      return true;
    }
    return host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export function resolveIframeSandboxPreset(
  baseUrl: string | null | undefined,
  override?: IframeSandboxPreset | null,
): IframeSandboxPreset {
  if (override === 'strict' || override === 'trusted') {
    return override;
  }
  return isTrustedIframeBaseUrl(baseUrl) ? 'trusted' : 'strict';
}

export function sandboxAttrForPreset(preset: IframeSandboxPreset): string {
  return preset === 'trusted' ? SANDBOX_TRUSTED : SANDBOX_STRICT;
}

export function resolvePagePlaceholder(args: {
  readonly mode: 'live' | 'map-only' | 'compact';
  readonly hasUrl: boolean;
  readonly iframeError: boolean;
  /** Нода в viewport, но не в live-бюджете */
  readonly inViewport?: boolean;
  readonly isPinned?: boolean;
  /** Keep-alive: iframe в DOM, state сохранён */
  readonly isWarm?: boolean;
}): string {
  if (args.iframeError) {
    return 'Ошибка загрузки iframe';
  }
  if (args.mode === 'live') {
    if (!args.hasUrl) {
      return 'Нет URL';
    }
    if (args.isWarm) {
      return 'В памяти (заморожен, без перезагрузки)';
    }
    if (args.isPinned) {
      return 'Pin в очереди (бюджет iframe)';
    }
    if (args.inViewport) {
      return 'В кадре · ждёт слот (бюджет iframe)';
    }
    return 'Вне кадра · live при приближении';
  }
  if (args.mode === 'compact') {
    return 'Компакт';
  }
  return 'Только карта';
}

export function sandboxPresetLabel(preset: IframeSandboxPreset): string {
  if (preset === 'trusted') {
    return 'Sandbox trusted (localhost)';
  }
  return 'Sandbox strict';
}

function PageNodeInner(props: NodeProps<PageFlowNode>) {
  const node = props.data.node;
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const highlighted = useAppStore((s) => s.highlightedPageIds);
  const pinned = useAppStore((s) => s.pinnedPageIds);
  const live = useAppStore((s) => s.livePageIds);
  const warm = useAppStore((s) => s.warmPageIds);
  const mounted = useAppStore((s) => s.mountedPageIds);
  const mode = useAppStore((s) => s.mode);
  const scale = useAppStore((s) => s.iframeScale);
  const interactPageId = useAppStore((s) => s.interactPageId);
  const activeStates = useAppStore((s) => s.activeStates);
  const nodeViewports = useAppStore((s) => s.nodeViewports);
  const contentHeights = useAppStore((s) => s.contentHeights);
  const mapLayout = useAppStore((s) => s.document?.layout);
  const selectPage = useAppStore((s) => s.selectPage);
  const togglePin = useAppStore((s) => s.togglePin);
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const applyPageState = useAppStore((s) => s.applyPageState);
  const setInteract = useAppStore((s) => s.setInteract);
  const setVisible = useAppStore((s) => s.setVisible);
  const setNodeViewport = useAppStore((s) => s.setNodeViewport);
  const setContentHeight = useAppStore((s) => s.setContentHeight);
  const pushLog = useAppStore((s) => s.pushLog);
  const setDiagnosticsOpen = useAppStore((s) => s.setDiagnosticsOpen);
  const setLogFilterPageId = useAppStore((s) => s.setLogFilterPageId);
  const visiblePageIds = useAppStore((s) => s.visiblePageIds);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const documentBaseUrl = useAppStore((s) => s.document?.baseUrl ?? '');
  const url = useAppStore((s) => s.resolveLiveUrl(node.id));

  const bodyRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState(false);
  const isSelected = selectedPageId === node.id;
  const isDim =
    highlighted.size > 0 && !highlighted.has(node.id) && !isSelected;
  const isLive = live.has(node.id) && mode === 'live';
  const isWarm = warm.has(node.id) && mode === 'live';
  const isMounted = mounted.has(node.id) && mode === 'live';
  const activeStateName = activeStates.get(node.id);
  const isPinned = pinned.has(node.id);

  const override = nodeViewports.get(node.id);
  const viewport = resolveNodeViewport({
    nodeViewport: node.viewport,
    override,
    layout: mapLayout,
    measuredHeight: contentHeights.get(node.id),
  });
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

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const next = new Set(useAppStore.getState().visiblePageIds);
          if (entry.intersectionRatio >= 0.15) {
            next.add(node.id);
          } else if (entry.intersectionRatio <= 0.02) {
            next.delete(node.id);
          }
          const prev = useAppStore.getState().visiblePageIds;
          if (prev.size !== next.size || [...next].some((id) => !prev.has(id))) {
            setVisible(next);
          }
        }
      },
      { root: null, threshold: [0, 0.02, 0.15, 0.5, 1], rootMargin: '80px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [node.id, setVisible, visiblePageIds.size]);

  const onState = (st: AppMapPageState) => {
    if (activeStateName === st.name) {
      applyPageState(node.id, null);
    } else {
      applyPageState(node.id, st);
    }
  };

  const inViewport = visiblePageIds.has(node.id);
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
  /** Warm вне live: держим DOM, visually «приглушён» если не в кадре */
  const iframeDimmed = isWarm && !isLive;

  const applyPreset = (p: {
    readonly id: string;
    readonly label: string;
    readonly width: number;
    readonly height: number;
    readonly heightMode?: 'auto' | 'fixed';
  }) => {
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

  /** Resize по ширине; высота auto переизмеряется. Shift — free height (fixed). */
  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = viewport.width;
    const startH = viewport.height;
    const freeHeight = e.shiftKey;
    const pointerId = e.pointerId;
    const target = e.currentTarget;
    target.setPointerCapture(pointerId);

    const onMove = (ev: PointerEvent) => {
      const dw = (ev.clientX - startX) / scale;
      const nextW = Math.max(200, Math.min(2560, startW + dw));
      if (freeHeight) {
        const dh = (ev.clientY - startY) / scale;
        setNodeViewport(node.id, {
          width: Math.round(nextW),
          height: Math.max(120, startH + dh),
          label: 'Свой',
          heightMode: 'fixed',
        });
        return;
      }
      setNodeViewport(node.id, {
        width: Math.round(nextW),
        height: viewport.height,
        label: String(Math.round(nextW)),
        heightMode: 'auto',
      });
    };
    const onUp = () => {
      target.releasePointerCapture(pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.setTimeout(() => applyMeasuredHeight(), 200);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
        {node.groupIds?.[0] ? <Badge>{node.groupIds[0]}</Badge> : null}
        <div className="page-node__title">{node.title}</div>
        {isLive ? (
          <Badge>live</Badge>
        ) : isWarm ? (
          <Badge>warm</Badge>
        ) : null}
        <div className="page-node__actions">
          <button
            type="button"
            className="icon-btn"
            title="Лог экрана"
            aria-label="Лог экрана"
            onClick={(e) => {
              e.stopPropagation();
              setLogFilterPageId(node.id);
              setDiagnosticsOpen(true);
            }}
          >
            <Terminal size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className={`icon-btn${isPinned ? ' icon-btn--on' : ''}`}
            title="Закрепить live"
            aria-label={isPinned ? 'Открепить' : 'Закрепить'}
            aria-pressed={isPinned}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(node.id);
            }}
          >
            {isPinned ? (
              <PinOff size={15} strokeWidth={1.75} />
            ) : (
              <Pin size={15} strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Открыть во вкладке"
            aria-label="Открыть во вкладке"
            onClick={(e) => {
              e.stopPropagation();
              openPageInNewTab(node.id);
            }}
          >
            <ExternalLink size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="page-node__path" title={url ?? node.pathPattern}>
        {node.pathExample ?? node.pathPattern}
        <span className="page-node__size">
          {' '}
          · {viewport.width}×{viewport.height}
          {viewport.heightMode === 'auto' ? ' auto' : ''}
          {viewport.label ? ` ${viewport.label}` : ''}
        </span>
      </div>
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
          <div
            className="page-node__iframe-shell"
            data-sandbox-preset={sandboxPreset}
            data-lam-iframe-shell
            style={{
              width: layout.contentWidth,
              height: layout.contentHeight,
            }}
          >
            <iframe
              ref={iframeRef}
              key={`${url}:${sandboxPreset}:${viewport.width}:${viewport.heightMode ?? 'auto'}`}
              title={node.title}
              src={url}
              width={viewport.width}
              height={viewport.height}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-read; clipboard-write"
              className={
                interactPageId === node.id
                  ? 'page-node__iframe page-node__iframe--interact nodrag nopan nowheel'
                  : 'page-node__iframe nodrag nopan nowheel'
              }
              data-lam-interact={interactPageId === node.id ? '1' : '0'}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: viewport.width,
                height: viewport.height,
                border: 0,
                transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`,
                transformOrigin: '0 0',
                /* Только explicit «Клики в iframe» — hover/click доходят в app */
                pointerEvents: interactPageId === node.id ? 'auto' : 'none',
                zIndex: interactPageId === node.id ? 2 : 0,
                /* Warm keep-alive: DOM жив; чуть тусклее если не live-слот */
                opacity: iframeDimmed ? 0.92 : 1,
              }}
              sandbox={sandboxValue}
              onLoad={() => {
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
              }}
              onError={() => {
                setIframeError(true);
                pushLog({
                  level: 'error',
                  source: node.id,
                  message: `iframe error · ${url ?? 'no url'}`,
                });
              }}
            />
          </div>
        ) : (
          <div className="page-node__placeholder" role="status">
            {placeholder}
          </div>
        )}
        <div
          className="page-node__resize"
          title="Ширина (Shift — free height / fixed)"
          onPointerDown={onResizePointerDown}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {isSelected ? (
        <div
          className="page-node__viewport-bar"
          onClick={(e) => e.stopPropagation()}
        >
          <Smartphone size={12} strokeWidth={1.75} aria-hidden={true} />
          {widthPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`page-node__vp-btn${
                viewport.width === p.width ? ' page-node__vp-btn--on' : ''
              }`}
              title={`${p.label} · ${p.width}px · height ${p.heightMode ?? 'auto'}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : node.states && node.states.length > 0 ? (
        <div className="page-node__states">
          {node.states.map((st) => (
            <Chip
              key={st.name}
              active={activeStateName === st.name}
              title={st.note ?? st.name}
              onClick={(e) => {
                e.stopPropagation();
                onState(st);
              }}
            >
              {st.name === 'recruiter'
                ? 'рекрутер'
                : st.name === 'employer'
                  ? 'клиент'
                  : st.name}
            </Chip>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const PageNode = memo(PageNodeInner);
