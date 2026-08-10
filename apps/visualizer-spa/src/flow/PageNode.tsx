/**
 * Кастомная нода React Flow: chrome + live iframe slot + стейты.
 * URL — селектор `resolveLiveUrl(id)`, чтобы role/state триггерили src.
 *
 * Security: sandbox-preset `strict` (без allow-same-origin) vs `trusted`
 * (allowlist localhost / *.localhost dogfood). Комбинация
 * allow-scripts + allow-same-origin снимает изоляцию iframe.
 */
import type { AppMapNode, AppMapPageState } from '@live-app-map/schema';
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useAppStore } from '../store/app-store';
import { NODE_H, NODE_W } from './layout';

export type PageNodeData = {
  readonly node: AppMapNode;
};

/** Тип ноды React Flow для строгой типизации `data` без cast. */
export type PageFlowNode = Node<PageNodeData, 'page'>;

/** Preset sandbox iframe: trusted = dogfood same-origin, strict = без same-origin. */
export type IframeSandboxPreset = 'strict' | 'trusted';

/** Trusted dogfood: scripts + same-origin (нужно многим SPA). */
export const SANDBOX_TRUSTED =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals';

/**
 * Strict: без `allow-same-origin` — escape-класс scripts+same-origin закрыт.
 * Часть приложений ломается (cookies/localStorage origin).
 */
export const SANDBOX_STRICT =
  'allow-scripts allow-forms allow-popups allow-modals';

const ICON_HIT: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  width: 44,
  height: 44,
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  boxSizing: 'border-box',
};

/**
 * Хост baseUrl считается trusted dogfood (localhost / loopback / *.localhost).
 * Вне allowlist — strict sandbox.
 *
 * @param baseUrl - document.baseUrl или override
 * @returns true, если origin в allowlist
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
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
      return true;
    }
    if (host.endsWith('.localhost')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Выбирает sandbox preset: явный override или allowlist baseUrl.
 *
 * @param baseUrl - эффективный baseUrl карты
 * @param override - принудительный preset (из prop/store, если передан)
 * @returns preset strict | trusted
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
 * Атрибут `sandbox` для iframe по preset.
 *
 * @param preset - strict | trusted
 * @returns строка sandbox
 */
export function sandboxAttrForPreset(preset: IframeSandboxPreset): string {
  return preset === 'trusted' ? SANDBOX_TRUSTED : SANDBOX_STRICT;
}

/**
 * Текст плейсхолдера слота (RU, кроме mode-имени Map-only).
 *
 * @param args - mode, url, iframeError
 * @returns строка для empty/freeze/error
 */
export function resolvePagePlaceholder(args: {
  readonly mode: 'live' | 'map-only' | 'compact';
  readonly hasUrl: boolean;
  readonly iframeError: boolean;
}): string {
  if (args.iframeError) {
    return 'Ошибка загрузки';
  }
  if (args.mode === 'live') {
    return args.hasUrl ? 'Заморожено' : 'Нет URL';
  }
  if (args.mode === 'compact') {
    return 'Compact';
  }
  return 'Map-only';
}

/**
 * Короткая подпись sandbox в UI (allowlist note).
 *
 * @param preset - активный preset
 * @returns RU-метка
 */
export function sandboxPresetLabel(preset: IframeSandboxPreset): string {
  if (preset === 'trusted') {
    return 'sandbox: trusted (allowlist baseUrl · same-origin)';
  }
  return 'sandbox: strict (вне allowlist · без same-origin)';
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
  /** Подписка на строку URL, не на метод — иначе globalRole/activeStates не двигают iframe */
  const url = useAppStore((s) => s.resolveLiveUrl(node.id));

  const bodyRef = useRef<HTMLDivElement>(null);
  const [iframeError, setIframeError] = useState(false);
  const isSelected = selectedPageId === node.id;
  const isDim =
    highlighted.size > 0 && !highlighted.has(node.id) && !isSelected;
  const isLive = live.has(node.id) && mode === 'live';
  const activeStateName = activeStates.get(node.id);

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
  const iframeH = (NODE_H - 96) / scale;

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
      onClick={() => selectPage(node.id)}
      onDoubleClick={() => setInteract(node.id)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="page-node__header">
        {node.groupIds?.[0] ? (
          <span className="page-node__badge">{node.groupIds[0]}</span>
        ) : null}
        <div className="page-node__title">{node.title}</div>
        <div className="page-node__actions">
          <button
            type="button"
            className={`icon-btn${pinned.has(node.id) ? ' icon-btn--on' : ''}`}
            style={ICON_HIT}
            title="Закрепить (держать iframe живым)"
            aria-label="Закрепить страницу"
            aria-pressed={pinned.has(node.id)}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(node.id);
            }}
          >
            📌
          </button>
          <button
            type="button"
            className="icon-btn"
            style={ICON_HIT}
            title="Открыть в новой вкладке"
            aria-label="Открыть в новой вкладке"
            onClick={(e) => {
              e.stopPropagation();
              openPageInNewTab(node.id);
            }}
          >
            ↗
          </button>
        </div>
      </div>
      <div className="page-node__path" title={url ?? node.pathPattern}>
        {node.pathExample ?? node.pathPattern}
      </div>
      <div className="page-node__body" ref={bodyRef} data-page-id={node.id}>
        {showIframe ? (
          <div
            className="page-node__iframe-shell"
            data-sandbox-preset={sandboxPreset}
            title={sandboxNote}
          >
            <iframe
              key={`${url}:${sandboxPreset}`}
              title={node.title}
              src={url}
              width={iframeW}
              height={iframeH}
              style={{
                transform: `scale(${scale})`,
                pointerEvents:
                  interactPageId === node.id || isSelected ? 'auto' : 'none',
              }}
              sandbox={sandboxValue}
              onError={() => setIframeError(true)}
            />
            <span
              className="page-node__sandbox-note"
              style={{
                position: 'absolute',
                left: 4,
                bottom: 4,
                zIndex: 2,
                fontSize: 9,
                lineHeight: 1.2,
                maxWidth: '92%',
                padding: '2px 4px',
                borderRadius: 4,
                color: 'var(--text-muted, #9aa3b5)',
                background: 'rgba(8, 10, 15, 0.72)',
                pointerEvents: 'none',
              }}
              aria-hidden={true}
            >
              {sandboxNote}
            </span>
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
            <button
              key={st.name}
              type="button"
              className={`state-chip${activeStateName === st.name ? ' state-chip--active' : ''}`}
              title={st.note ?? st.name}
              onClick={(e) => {
                e.stopPropagation();
                onState(st);
              }}
            >
              {st.name}
            </button>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const PageNode = memo(PageNodeInner);
