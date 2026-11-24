/**
 * Кнопка шапки: лист всех замечаний и число ждущих проверки.
 */
import { MessageSquare } from 'lucide-react';
import { useCommentsStore } from '../../store/comments-store';
import { ToolbarButton } from '../toolbar/ToolbarButton';

/**
 * Открывает и закрывает лист (⇧C).
 */
export function CommentsToolbarButton() {
  const open = useCommentsStore((s) => s.sheetOpen);
  const review = useCommentsStore((s) => s.threads.filter((t) => t.stage === 'review').length);
  return (
    <ToolbarButton
      icon={MessageSquare}
      selected={open}
      aria-expanded={open}
      onClick={() => {
        const c = useCommentsStore.getState();
        if (open) {
          c.closeSheet();
        } else {
          c.openSheet(null);
        }
      }}
      title="Все замечания (⇧C)"
      aria-label={review > 0 ? `Замечания: проверить ${review}` : 'Замечания'}
      data-testid="open-comments"
    >
      {review > 0 ? <span className="toolbar__count" data-testid="open-comments-count">{review}</span> : null}
    </ToolbarButton>
  );
}
