/**
 * Кнопки шапки ноды под мышью: закрепить, открыть во вкладке. У выбранного экрана всё — в плашке под ним.
 */
import { ExternalLink, Pin, PinOff } from 'lucide-react';
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
  return (
    <div className="page-node__actions">
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
