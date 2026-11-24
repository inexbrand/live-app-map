/**
 * Замечание: этап, текст, ответы агента (файлы, коммит), смены статуса и решение
 * пользователя по ответу — «Принять» или «Не исправлено» с причиной.
 */
import type { CommentEvent, CommentStage, CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { useState } from 'react';
import { timeAgo } from '../../lib/comments/format';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore, type CommentReview } from '../../store/comments-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STAGE_LABEL: Readonly<Record<CommentStage, string>> = {
  review: 'Проверьте',
  waiting: 'Ждёт агента',
  done: 'Исправлено',
};

/**
 * Этап замечания меткой.
 *
 * @param props - этап
 */
export function StageBadge(props: { readonly stage: CommentStage }) {
  return (
    <span className={`comment-stage comment-stage--${props.stage}`} data-testid="comment-stage">
      {STAGE_LABEL[props.stage]}
    </span>
  );
}

function who(author: CommentThread['author']): string {
  return author === 'agent' ? 'Агент' : 'Вы';
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
        {e.files.length > 0 || e.commit !== null ? (
          <p className="comment-reply__files">{[...e.files, ...(e.commit === null ? [] : [e.commit])].join(' · ')}</p>
        ) : null}
      </div>
    );
  }
  if (e.type === 'status') {
    const what = e.status === 'fixed' ? (e.author === 'agent' ? 'отметил «исправлено»' : 'приняли') : e.author === 'agent' ? 'открыл снова' : 'вернули агенту';
    return (
      <p className="comment-event" data-testid="comment-event">
        {who(e.author)} {what}
        {e.note === null ? '' : `: ${e.note}`}
      </p>
    );
  }
  return null;
}

/** Решить по ответу; ошибка сервера — в подсказку. */
function decide(id: string, review: CommentReview): void {
  void useCommentsStore
    .getState()
    .review(id, review)
    .catch((err: unknown) => useAppStore.getState().setToast(`Не сохранилось: ${err instanceof Error ? err.message : String(err)}`));
}

/**
 * Кнопки решения: «Принять», «Не исправлено» → причина и «Вернуть агенту».
 * У исправленного — «Открыть снова».
 *
 * @param props - замечание
 */
export function ReviewActions(props: { readonly thread: CommentThread }) {
  const t = props.thread;
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  if (t.stage === 'waiting') {
    return null;
  }
  if (t.stage === 'done') {
    return (
      <div className="comment-thread__actions">
        <Button type="button" size="sm" variant="ghost" onClick={() => decide(t.id, { kind: 'reject', note: null })}>
          Открыть снова
        </Button>
      </div>
    );
  }
  if (rejecting) {
    return (
      <form
        className="comment-thread__reject"
        onSubmit={(e) => {
          e.preventDefault();
          decide(t.id, { kind: 'reject', note });
        }}
      >
        <Input autoFocus={true} aria-label="Что осталось не так" placeholder="Что осталось не так (можно пусто)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" size="sm">
          Вернуть агенту
        </Button>
      </form>
    );
  }
  return (
    <div className="comment-thread__actions">
      <Button type="button" size="sm" variant="outline" onClick={() => decide(t.id, { kind: 'accept' })}>
        Принять
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(true)}>
        Не исправлено
      </Button>
    </div>
  );
}

/**
 * Замечание целиком.
 *
 * @param props - замечание, подсветка, подпись «экран · компонент» (в листе)
 */
export function ThreadCard(props: { readonly thread: CommentThread; readonly focused: boolean; readonly where?: string }) {
  const t = props.thread;
  const now = new Date();
  return (
    <article className={`comment-thread${props.focused ? ' comment-thread--focus' : ''}`} data-testid="comment-thread" data-comment-id={t.id} data-stage={t.stage}>
      <div className="comment-thread__head">
        <StageBadge stage={t.stage} />
        {props.where === undefined ? null : <span className="comment-thread__where">{props.where}</span>}
        <time className="comment-thread__time" dateTime={t.updatedAt}>
          {timeAgo(t.updatedAt, now)}
        </time>
      </div>
      <p className="comment-thread__text">{t.text}</p>
      {t.events.slice(1).map((e) => (
        <EventLine key={`${e.seq}-${e.at}`} event={e} now={now} />
      ))}
      <ReviewActions thread={t} />
    </article>
  );
}
