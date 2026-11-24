/**
 * Метки на живом экране ноды: замечания по этапу (проверьте, ждёт агента,
 * исправлено) и неотправленные черновики — в левом верхнем углу элемента, в
 * масштабе экрана. Клик — экран в фокус и окно замечания у элемента.
 */
import type { CommentAnchor, CommentStage } from '@live-app-map/mcp-server/comments-schema';
import { memo, useMemo } from 'react';
import { openAnchor } from '../../lib/comments/go-to-comment';
import { targetKey, useCommentsStore, type PageFrame } from '../../store/comments-store';

type Mark = {
  readonly key: string;
  readonly anchor: CommentAnchor;
  readonly frame: PageFrame;
  readonly kind: CommentStage | 'draft';
  readonly title: string;
  readonly threadId: string | null;
};

/** Метки ноды: по одной на элемент — у черновика своя, у замечаний самая важная по этапу. */
function marksOf(nodeId: string, threads: ReturnType<typeof useCommentsStore.getState>['threads'], drafts: ReturnType<typeof useCommentsStore.getState>['drafts']): readonly Mark[] {
  const rank: Readonly<Record<CommentStage, number>> = { review: 0, waiting: 1, done: 2 };
  const byKey = new Map<string, Mark>();
  for (const t of threads) {
    const el = t.anchor.element;
    if (t.anchor.pageId !== nodeId || el === null || el.rect.width === 0) {
      continue;
    }
    const key = targetKey(t.anchor);
    const prev = byKey.get(key);
    if (prev === undefined || (prev.kind !== 'draft' && rank[t.stage] < rank[prev.kind])) {
      byKey.set(key, { key, anchor: t.anchor, frame: { rect: el.rect, pageWidth: el.viewport.width }, kind: t.stage, title: t.text, threadId: t.id });
    }
  }
  for (const d of drafts.values()) {
    if (d.anchor.pageId === nodeId && d.frame !== null) {
      const key = targetKey(d.anchor);
      byKey.set(key, { key, anchor: d.anchor, frame: d.frame, kind: 'draft', title: `Черновик: ${d.text}`, threadId: null });
    }
  }
  return [...byKey.values()];
}

/**
 * Метки ноды.
 */
export const CommentMarkers = memo(function CommentMarkers(props: { readonly nodeId: string; readonly scaleX: number; readonly scaleY: number }) {
  const threads = useCommentsStore((s) => s.threads);
  const drafts = useCommentsStore((s) => s.drafts);
  const focusId = useCommentsStore((s) => s.focusId);
  const marks = useMemo(() => marksOf(props.nodeId, threads, drafts), [props.nodeId, threads, drafts]);
  if (marks.length === 0) {
    return null;
  }
  return (
    <div className="comment-markers" aria-label="Замечания на экране">
      {marks.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`comment-marker comment-marker--${m.kind}${m.threadId !== null && m.threadId === focusId ? ' comment-marker--focus' : ''}`}
          data-testid="comment-marker"
          data-comment-id={m.threadId ?? undefined}
          data-kind={m.kind}
          title={m.title}
          aria-label={m.title}
          style={{ left: m.frame.rect.x * props.scaleX, top: m.frame.rect.y * props.scaleY }}
          onClick={(e) => {
            e.stopPropagation();
            useCommentsStore.getState().focus(m.threadId);
            openAnchor(m.anchor, m.frame);
          }}
        />
      ))}
    </div>
  );
});
