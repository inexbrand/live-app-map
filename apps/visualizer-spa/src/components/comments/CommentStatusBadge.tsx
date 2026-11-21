/**
 * Статус замечания: открыто (нужно исправить) или исправлено.
 */
import type { CommentStatus } from '@live-app-map/mcp-server/comments-schema';

/**
 * Бейдж статуса.
 */
export function CommentStatusBadge(props: { readonly status: CommentStatus }) {
  return (
    <span className={`comment-status comment-status--${props.status}`} data-testid="comment-status">
      {props.status === 'open' ? 'Открыто' : 'Исправлено'}
    </span>
  );
}
