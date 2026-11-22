/**
 * Кнопка шапки: все замечания проекта и число открытых.
 */
import { MessageSquare } from 'lucide-react';
import { useCommentsStore } from '../../store/comments-store';
import { ToolbarButton } from '../toolbar/ToolbarButton';

/**
 * Открывает и закрывает общий список (⇧C).
 */
export function CommentsToolbarButton() {
  const open = useCommentsStore((s) => s.listOpen);
  const setOpen = useCommentsStore((s) => s.setListOpen);
  const openCount = useCommentsStore((s) => s.threads.filter((t) => t.status === 'open').length);
  return (
    <ToolbarButton
      icon={MessageSquare}
      selected={open}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      title="Все замечания проекта (⇧C)"
      aria-label={openCount > 0 ? `Замечания: открыто ${openCount}` : 'Замечания'}
      data-testid="open-comments"
    >
      {openCount > 0 ? <span className="toolbar__count" data-testid="open-comments-count">{openCount}</span> : null}
    </ToolbarButton>
  );
}
