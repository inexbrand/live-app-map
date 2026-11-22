/**
 * Кнопки шапки ноды: замечание, лог, закрепить, открыть во вкладке.
 */
import { ExternalLink, MessageSquarePlus, Pin, PinOff, Terminal } from 'lucide-react';
import { startComment } from '../../components/comments/start-comment';
import { useAppStore } from '../../store/app-store';

/** Props кнопок ноды. */
export type NodeActionsProps = {
  readonly nodeId: string;
  readonly isPinned: boolean;
};

/**
 * Кнопки шапки ноды.
 *
 * @param props - id ноды и закреплена ли она
 */
export function NodeActions(props: NodeActionsProps) {
  const { nodeId, isPinned } = props;
  const togglePin = useAppStore((s) => s.togglePin);
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const setDiagnosticsOpen = useAppStore((s) => s.setDiagnosticsOpen);
  const setLogFilterPageId = useAppStore((s) => s.setLogFilterPageId);
  return (
    <div className="page-node__actions">
      <button
        type="button"
        className="icon-btn"
        title="Замечание к компоненту этого экрана (C)"
        aria-label="Замечание к компоненту"
        data-testid="node-comment"
        onClick={(e) => {
          e.stopPropagation();
          startComment('element', nodeId);
        }}
      >
        <MessageSquarePlus size={15} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Лог экрана"
        aria-label="Лог экрана"
        onClick={(e) => {
          e.stopPropagation();
          setLogFilterPageId(nodeId);
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
          togglePin(nodeId);
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
          openPageInNewTab(nodeId);
        }}
      >
        <ExternalLink size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
