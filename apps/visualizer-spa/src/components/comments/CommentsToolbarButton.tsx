/**
 * Кнопка шапки: все замечания проекта и число открытых.
 */
import { MessageSquare } from 'lucide-react';
import { useCommentsStore } from '../../store/comments-store';
import { Button } from '../../ui';

/**
 * Открывает и закрывает общий список (⇧C).
 */
export function CommentsToolbarButton() {
  const open = useCommentsStore((s) => s.listOpen);
  const setOpen = useCommentsStore((s) => s.setListOpen);
  const openCount = useCommentsStore((s) => s.threads.filter((t) => t.status === 'open').length);
  return (
    <Button
      type="button"
      size="sm"
      variant={open ? 'primary' : 'outline'}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      title="Все замечания проекта (⇧C)"
      data-testid="open-comments"
    >
      <MessageSquare size={16} strokeWidth={1.75} />
      <span className="toolbar__label">Замечания</span>
      {openCount > 0 ? <span className="toolbar__count" data-testid="open-comments-count">{openCount}</span> : null}
    </Button>
  );
}
