/**
 * Замечания выбранного экрана: оставить новое (компонент курсором или
 * область), ветки с ответами ИИ и статусами.
 */
import { useMemo } from 'react';
import { commentsLabel } from '../../lib/comments/format';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { CommentThreadItem } from './CommentThreadItem';

/**
 * Левая панель экрана.
 */
export function ScreenCommentsPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const node = useAppStore((s) => (s.selectedPageId === null ? undefined : s.index?.nodesById.get(s.selectedPageId)));
  const threads = useCommentsStore((s) => s.threads);
  const focusId = useCommentsStore((s) => s.focusId);
  const listOpen = useCommentsStore((s) => s.listOpen);
  const mine = useMemo(() => threads.filter((t) => t.anchor.pageId === selectedPageId), [threads, selectedPageId]);

  // Левая панель — только ветки: пустая не отнимает место у холста,
  // начать замечание можно из панели экрана справа (и клавишей C).
  // Левую сторону занимает общий список, пока он открыт.
  if (selectedPageId === null || node === undefined || listOpen || mine.length === 0) {
    return null;
  }
  const open = mine.filter((t) => t.status === 'open').length;

  return (
    <aside className="drawer drawer--left drawer--edge comments-panel flex flex-col bg-background" data-testid="screen-comments">
      <header className="flex flex-col gap-0.5 border-b border-border p-3">
        <h2 className="text-sm font-medium">Замечания</h2>
        <p className="text-xs text-muted-foreground">{`${node.title} · ${commentsLabel(mine.length)}, открыто ${open}`}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="comments-panel__list">
          {mine.map((t) => (
            <CommentThreadItem key={t.id} thread={t} focused={t.id === focusId} />
          ))}
        </div>
      </div>
    </aside>
  );
}