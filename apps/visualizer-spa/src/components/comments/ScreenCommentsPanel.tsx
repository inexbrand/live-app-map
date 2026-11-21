/**
 * Замечания выбранного экрана: оставить новое (компонент курсором или
 * область), ветки с ответами ИИ и статусами.
 */
import { MessageSquarePlus, SquareDashed } from 'lucide-react';
import { useMemo } from 'react';
import { commentsLabel } from '../../lib/comments/format';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { startComment } from './start-comment';
import { Button, PanelBody, PanelHeader } from '../../ui';
import { CommentThreadItem } from './CommentThreadItem';

/**
 * Левая панель экрана.
 */
export function ScreenCommentsPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const node = useAppStore((s) => (s.selectedPageId === null ? undefined : s.index?.nodesById.get(s.selectedPageId)));
  const threads = useCommentsStore((s) => s.threads);
  const focusId = useCommentsStore((s) => s.focusId);
  const mine = useMemo(() => threads.filter((t) => t.anchor.pageId === selectedPageId), [threads, selectedPageId]);

  if (selectedPageId === null || node === undefined) {
    return null;
  }
  const open = mine.filter((t) => t.status === 'open').length;

  return (
    <aside className="drawer drawer--left ui-panel drawer--edge comments-panel" data-testid="screen-comments">
      <PanelHeader
        title="Замечания"
        description={mine.length === 0 ? node.title : `${node.title} · ${commentsLabel(mine.length)}, открыто ${open}`}
      />
      <PanelBody>
        <div className="comments-panel__start">
          <Button type="button" variant="primary" size="sm" onClick={() => startComment('element')} title="Наведите на компонент живого экрана и кликните (C)">
            <MessageSquarePlus size={16} strokeWidth={1.75} />
            Замечание к компоненту
            <kbd className="palette__kbd">C</kbd>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => startComment('region')} title="Выделить область мышью (⌥⇧S)">
            <SquareDashed size={16} strokeWidth={1.75} />
            Область
          </Button>
        </div>
        {mine.length === 0 ? (
          <p className="drawer__hint">Замечаний к экрану нет. Нажмите C, кликните по компоненту — поле откроется рядом с ним.</p>
        ) : (
          <div className="comments-panel__list">
            {mine.map((t) => (
              <CommentThreadItem key={t.id} thread={t} focused={t.id === focusId} />
            ))}
          </div>
        )}
      </PanelBody>
    </aside>
  );
}
