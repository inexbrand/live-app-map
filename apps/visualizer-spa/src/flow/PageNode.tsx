/**
 * Кастомная нода React Flow: chrome + live iframe + стейты (UI kit + Lucide).
 */
import type { AppMapNode, AppMapPageState } from '@live-app-map/schema';
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { ExternalLink, Pin, PinOff } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { Badge, Chip } from '../ui';
import { useAppStore } from '../store/app-store';
import { NODE_H, NODE_W } from './layout';

export type PageNodeData = {
  readonly node: AppMapNode;
};

export type PageFlowNode = Node<PageNodeData, 'page'>;

export type IframeSandboxPreset = 'strict' | 'trusted';

export const SANDBOX_TRUSTED =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';

export const SANDBOX_STRICT =
  'allow-scripts allow-forms allow-popups allow-modals';

/**
 * Trusted dogfood host (localhost / loopback / *.localhost).
 */
export function isTrustedIframeBaseUrl(baseUrl: string | null | undefined): boolean {
  if (baseUrl === null || baseUrl === undefined) {
    return false;
  }
  const trimmed = baseUrl.trim();
  if (trimmed === '') {
    return false;
  }
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
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

/**
 * Preset sandbox по baseUrl.
 */
export function resolveIframeSandboxPreset(
  baseUrl: string | null | undefined,
  override?: IframeSandboxPreset | null,
): IframeSandboxPreset {
  if (override === 'strict' || override === 'trusted') {
    return override;
  }
  return isTrustedIframeBaseUrl(baseUrl) ? 'trusted' : 'strict';
}

/**
 * Атрибут sandbox.
 */
export function sandboxAttrForPreset(preset: IframeSandboxPreset): string {
  return preset === 'trusted' ? SANDBOX_TRUSTED : SANDBOX_STRICT;
}

/**
 * Плейсхолдер слота.
 */
export function resolvePagePlaceholder(args: {
  readonly mode: 'live' | 'map-only' | 'compact';
  readonly hasUrl: boolean;
  readonly iframeError: boolean;
}): string {
  if (args.iframeError) {
    return 'Ошибка загрузки iframe';
  }
  if (args.mode === 'live') {
    return args.hasUrl ? 'Заморожено (вне viewport / бюджета)' : 'Нет URL';
  }
  if (args.mode === 'compact') {
    return 'Compact';
  }
  return 'Map-only';
}

/**
 * Короткая подпись sandbox (tooltip).
 */
export function sandboxPresetLabel(preset: IframeSandboxPreset): string {
  if (preset === 'trusted') {
    return 'Sandbox trusted: same-origin для dogfood localhost';
  }
  return 'Sandbox strict: без same-origin (вне allowlist)';
}

function PageNodeInner(props: NodeProps<PageFlowNode>) {
  const node = props.data.node;
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const highlighted = useAppStore((s) => s.highlightedPageIds);
  const pinned = useAppStore((s) => s.pinnedPageIds);
  const live = useAppStore((s) => s.livePageIds);
  const mode = useAppStore((s) => s.mode);
  const scale = useAppStore((s) => s.iframeScale);
  const interactPageId = useAppStore((s) => s.interactPageId);
  const activeStates = useAppStore((s) => s.activeStates);
  const selectPage = useAppStore((s) => s.selectPage);
  const togglePin = useAppStore((s) => s.togglePin);
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const applyPageState = useAppStore((s) => s.applyPageState);
  const setInteract = useAppStore((s) => s.setInteract);
  const setVisible = useAppStore((s) => s.setVisible);
  const visiblePageIds = useAppStore((s) => s.visiblePageIds);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const documentBaseUrl = useAppStore((s) => s.document?.baseUrl ?? '');
  const url = useAppStore((s) => s.resolveLiveUrl(node.id));

  const bodyRef = useRef<HTMLDivElement>(null);
  const [iframeError, setIframeError] = useState(false);
  const isSelected = selectedPageId === node.id;
  const isDim =
    highlighted.size > 0 && !highlighted.has(node.id) && !isSelected;
  const isLive = live.has(node.id) && mode === 'live';
  const activeStateName = activeStates.get(node.id);
  const isPinned = pinned.has(node.id);

  const effectiveBaseUrl =
    baseUrlOverride.trim() !== '' ? baseUrlOverride : documentBaseUrl;
  const sandboxPreset = resolveIframeSandboxPreset(effectiveBaseUrl);
  const sandboxValue = sandboxAttrForPreset(sandboxPreset);
  const sandboxNote = sandboxPresetLabel(sandboxPreset);

  useEffect(() => {
    setIframeError(false);
  }, [url]);

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

  const iframeW = (NODE_W - 16) / scale;
  const iframeH = (NODE_H - 112) / scale;

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
  });

  const showIframe = isLive && url && !iframeError;

  return (
    <div
      className={`page-node${isSelected ? ' page-node--selected' : ''}${isDim ? ' page-node--dim' : ''}`}
      style={{ width: NODE_W, height: NODE_H }}
      data-page-id={node.id}
      data-lam-node={node.id}
      onClick={() => selectPage(node.id)}
      onDoubleClick={() => setInteract(node.id)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="page-node__header">
        {node.groupIds?.[0] ? <Badge>{node.groupIds[0]}</Badge> : null}
        <div className="page-node__title">{node.title}</div>
        <div className="page-node__actions">
          <button
            type="button"
            className={`icon-btn${isPinned ? ' icon-btn--on' : ''}`}
            title="Закрепить live iframe"
            aria-label={isPinned ? 'Открепить' : 'Закрепить'}
            aria-pressed={isPinned}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(node.id);
            }}
          >
            {isPinned ? <PinOff size={16} strokeWidth={1.75} /> : <Pin size={16} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Открыть в новой вкладке"
            aria-label="Открыть в новой вкладке"
            onClick={(e) => {
              e.stopPropagation();
              openPageInNewTab(node.id);
            }}
          >
            <ExternalLink size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="page-node__path" title={url ?? node.pathPattern}>
        {node.pathExample ?? node.pathPattern}
      </div>
      <div
        className="page-node__body"
        ref={bodyRef}
        data-page-id={node.id}
        title={sandboxNote}
      >
        {showIframe ? (
          <div
            className="page-node__iframe-shell"
            data-sandbox-preset={sandboxPreset}
          >
            <iframe
              key={`${url}:${sandboxPreset}`}
              title={node.title}
              src={url}
              width={iframeW}
              height={iframeH}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-read; clipboard-write"
              style={{
                transform: `scale(${scale})`,
                pointerEvents:
                  interactPageId === node.id || isSelected ? 'auto' : 'none',
              }}
              sandbox={sandboxValue}
              onError={() => setIframeError(true)}
            />
          </div>
        ) : (
          <div className="page-node__placeholder" role="status">
            {placeholder}
          </div>
        )}
      </div>
      {node.states && node.states.length > 0 ? (
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
              {st.name}
            </Chip>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const PageNode = memo(PageNodeInner);
