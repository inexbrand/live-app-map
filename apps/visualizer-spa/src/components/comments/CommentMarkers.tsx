/**
 * Метки замечаний на живом экране ноды: в левом верхнем углу элемента,
 * в масштабе iframe. Клик — выбрать экран и раскрыть ветку.
 */
import { memo, useMemo } from 'react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';

/**
 * Метки ноды.
 */
export const CommentMarkers = memo(function CommentMarkers(props: { readonly nodeId: string; readonly scaleX: number; readonly scaleY: number }) {
  const threads = useCommentsStore((s) => s.threads);
  const focusId = useCommentsStore((s) => s.focusId);
  const mine = useMemo(
    () => threads.filter((t) => t.anchor.pageId === props.nodeId && t.anchor.element !== null && t.anchor.element.rect.width > 0),
    [threads, props.nodeId],
  );
  if (mine.length === 0) {
    return null;
  }
  return (
    <div className="comment-markers" aria-label="Замечания на экране">
      {mine.map((t) => {
        const r = t.anchor.element?.rect ?? { x: 0, y: 0 };
        return (
          <button
            key={t.id}
            type="button"
            className={`comment-marker comment-marker--${t.status}${t.id === focusId ? ' comment-marker--focus' : ''}`}
            data-testid="comment-marker"
            data-comment-id={t.id}
            data-status={t.status}
            title={t.text}
            aria-label={`Замечание: ${t.text}`}
            style={{ left: r.x * props.scaleX, top: r.y * props.scaleY }}
            onClick={(e) => {
              e.stopPropagation();
              useAppStore.getState().selectPage(props.nodeId);
              useCommentsStore.getState().focus(t.id);
            }}
          />
        );
      })}
    </div>
  );
});
