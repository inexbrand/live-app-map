/**
 * Кастомная нода React Flow: chrome + live iframe slot + стейты.
 * URL — селектор `resolveLiveUrl(id)`, чтобы role/state триггерили src.
 */
import type { AppMapNode, AppMapPageState } from '@live-app-map/schema';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/app-store';
import { NODE_H, NODE_W } from './layout';

export type PageNodeData = {
  readonly node: AppMapNode;
};

function PageNodeInner(props: NodeProps) {
  const data = props.data as PageNodeData;
  const node = data.node;
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
  /** Подписка на строку URL, не на метод — иначе globalRole/activeStates не двигают iframe */
  const url = useAppStore((s) => s.resolveLiveUrl(node.id));

  const bodyRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedPageId === node.id;
  const isDim =
    highlighted.size > 0 && !highlighted.has(node.id) && !isSelected;
  const isLive = live.has(node.id) && mode === 'live';
  const activeStateName = activeStates.get(node.id);

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

  let placeholder = 'Map-only';
  if (mode === 'live') {
    placeholder = url ? 'Заморожено / вне бюджета' : 'Нет URL';
  } else if (mode === 'compact') {
    placeholder = 'Compact';
  }

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
            title="Pin (держать iframe живым)"
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
            title="Открыть в новой вкладке"
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
        {isLive && url ? (
          <div className="page-node__iframe-shell">
            <iframe
              title={node.title}
              src={url}
              width={iframeW}
              height={iframeH}
              style={{
                transform: `scale(${scale})`,
                pointerEvents:
                  interactPageId === node.id || isSelected ? 'auto' : 'none',
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        ) : (
          <div className="page-node__placeholder">{placeholder}</div>
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
