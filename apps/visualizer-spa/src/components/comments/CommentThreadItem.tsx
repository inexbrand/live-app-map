/**
 * Ветка замечания: текст, где (компонент, исходник), снимок, ответы ИИ с
 * файлами и коммитом, смены статуса и действия.
 */
import type { CommentEvent, CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { ClipboardCopy, Crosshair, RotateCcw, Check } from 'lucide-react';
import { commentPrompt } from '../../lib/comments/comment-prompt';
import { timeAgo, quoteText, sourceRef } from '../../lib/comments/format';
import { flashElement } from '../../lib/comments/use-comments';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { Button } from '../../ui';
import { CommentStatusBadge } from './CommentStatusBadge';

function who(author: CommentThread['author']): string {
  return author === 'agent' ? 'ИИ' : 'Вы';
}

function EventLine(props: { readonly event: CommentEvent; readonly now: Date }) {
  const e = props.event;
  if (e.type === 'reply') {
    return (
      <div className="comment-reply" data-testid="comment-reply" data-author={e.author}>
        <div className="comment-reply__head">
          <strong>{who(e.author)}</strong>
          <time dateTime={e.at}>{timeAgo(e.at, props.now)}</time>
        </div>
        <p className="comment-reply__text">{e.text}</p>
        {e.files.length > 0 ? (
          <ul className="comment-reply__files">
            {e.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
        {e.commit !== null ? <code className="comment-reply__commit">{e.commit}</code> : null}
      </div>
    );
  }
  if (e.type === 'status') {
    return (
      <p className="comment-event" data-testid="comment-event">
        {who(e.author)} {e.status === 'fixed' ? 'отметил «исправлено»' : 'открыл снова'}
        {e.note === null ? '' : `: ${e.note}`} · {timeAgo(e.at, props.now)}
      </p>
    );
  }
  return null;
}

type ThreadElement = NonNullable<CommentThread['anchor']['element']>;

/** Где замечание: компонент (или тег), текст, исходник — или экран целиком. */
function ThreadWhere(props: { readonly el: ThreadElement | null }) {
  const { el } = props;
  if (el === null) {
    return <p className="comment-thread__where">Экран целиком</p>;
  }
  const src = el.component?.source ?? null;
  return (
    <p className="comment-thread__where" title={el.domPath}>
      <strong>{el.component?.name ?? (el.tag || 'элемент')}</strong>
      {el.text !== '' ? <span title={el.text}> «{quoteText(el.text, 48)}»</span> : null}
      {src !== null ? <span className="comment-thread__src">{sourceRef(src)}</span> : null}
    </p>
  );
}

/** Скопировать текст замечания для агента; итог — подсказкой. */
function copyForAgent(t: CommentThread, setToast: (text: string) => void): void {
  void navigator.clipboard.writeText(commentPrompt(t)).then(
    () => setToast('Замечание скопировано — вставьте агенту'),
    () => setToast('Не удалось скопировать в буфер'),
  );
}

/** Действия ветки: показать компонент, смена статуса, текст для агента. */
function ThreadActions(props: { readonly thread: CommentThread }) {
  const t = props.thread;
  const setStatus = useCommentsStore((s) => s.setStatus);
  const setToast = useAppStore((s) => s.setToast);
  const el = t.anchor.element;
  return (
    <div className="comment-thread__actions">
      {el !== null && el.rect.width > 0 ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => flashElement(t.anchor.pageId, el.selector)}>
          <Crosshair size={14} strokeWidth={1.75} />
          Показать
        </Button>
      ) : null}
      {t.status === 'open' ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void setStatus(t.id, 'fixed')}>
          <Check size={14} strokeWidth={1.75} />
          Исправлено
        </Button>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => void setStatus(t.id, 'open')}>
          <RotateCcw size={14} strokeWidth={1.75} />
          Открыть снова
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={() => copyForAgent(t, setToast)} title="Скопировать текст с привязкой и id для ответа агента">
        <ClipboardCopy size={14} strokeWidth={1.75} />
        Для агента
      </Button>
    </div>
  );
}

/**
 * Ветка замечания.
 */
export function CommentThreadItem(props: { readonly thread: CommentThread; readonly focused: boolean }) {
  const t = props.thread;
  const now = new Date();
  return (
    <article className={`comment-thread${props.focused ? ' comment-thread--focus' : ''}`} data-testid="comment-thread" data-comment-id={t.id} data-status={t.status}>
      <div className="comment-thread__head">
        <CommentStatusBadge status={t.status} />
        <span className="comment-thread__who">{who(t.author)}</span>
        <time className="comment-thread__time" dateTime={t.createdAt}>{timeAgo(t.createdAt, now)}</time>
      </div>
      <p className="comment-thread__text">{t.text}</p>
      <ThreadWhere el={t.anchor.element} />
      {t.shot !== null ? <img className="comment-thread__shot" src={`/api/comments/${encodeURIComponent(t.id)}/shot.png`} alt="Снимок компонента" loading="lazy" /> : null}
      {t.events.slice(1).map((e) => (
        <EventLine key={`${e.seq}-${e.at}`} event={e} now={now} />
      ))}
      <ThreadActions thread={t} />
    </article>
  );
}
