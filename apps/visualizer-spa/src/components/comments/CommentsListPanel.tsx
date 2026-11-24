/**
 * Все замечания проекта: фильтры по статусу, автору и тексту; клик — переход
 * к экрану на карте и подсветка компонента в живом экране.
 */
import type { CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { timeAgo } from '../../lib/comments/format';
import { flashElement } from '../../lib/comments/use-comments';
import { useAppStore } from '../../store/app-store';
import { filterThreads, useCommentsStore, type CommentListFilter } from '../../store/comments-store';
import { useViewStore } from '../../store/view-store';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OptionSelect } from '../option-select';
import { CommentStatusBadge } from './CommentStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUSES: ReadonlyArray<{ readonly id: CommentListFilter['status']; readonly label: string }> = [
  { id: 'open', label: 'Открытые' },
  { id: 'fixed', label: 'Исправленные' },
  { id: 'all', label: 'Все' },
];


/** Пункты фильтра «Автор». */
const AUTHOR_ITEMS = [
  { value: 'all', label: 'Все авторы' },
  { value: 'user', label: 'Мои' },
  { value: 'agent', label: 'От ИИ' },
];

/**
 * Перейти к замечанию: экран на холсте, ветка в панели, рамка у компонента.
 *
 * @param t - ветка
 */
export function goToComment(t: CommentThread): void {
  useViewStore.getState().setView('screens');
  useAppStore.getState().selectPage(t.anchor.pageId);
  useCommentsStore.getState().focus(t.id);
  // Список уступает место ветке экрана; фильтр сохранён — ⇧C вернёт его
  useCommentsStore.getState().setListOpen(false);
  const el = t.anchor.element;
  if (el === null || el.rect.width === 0) {
    return;
  }
  // Страница экрана открывается после перехода камеры — несколько попыток
  let tries = 0;
  const tick = (): void => {
    tries++;
    if (!flashElement(t.anchor.pageId, el.selector) && tries < 8) {
      window.setTimeout(tick, 500);
    }
  };
  window.setTimeout(tick, 600);
}

/** Автор фильтра по значению селекта. */
function authorOf(value: string): CommentListFilter['author'] {
  return value === 'user' || value === 'agent' ? value : 'all';
}

/** Фильтры списка: статус, автор, текст. */
function ListFilters() {
  const filter = useCommentsStore((s) => s.filter);
  const setFilter = useCommentsStore((s) => s.setFilter);
  return (
    <div className="comments-list__filters">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Статус"
        value={[filter.status]}
        onValueChange={(v: unknown[]) => {
          const next = STATUSES.find((s) => s.id === v[0]);
          if (next !== undefined) {
            setFilter({ status: next.id });
          }
        }}
      >
        {STATUSES.map((s) => (
          <ToggleGroupItem key={s.id} value={s.id}>
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="comments-list__row">
        <OptionSelect aria-label="Автор" size="sm" className="w-36 shrink-0" items={AUTHOR_ITEMS} value={filter.author} onValueChange={(v) => setFilter({ author: authorOf(v) })} />
        <Input aria-label="Поиск по замечаниям" placeholder="Текст, экран, компонент" value={filter.query} onChange={(e) => setFilter({ query: e.target.value })} />
      </div>
    </div>
  );
}

/** Текст последнего ответа ИИ или null. */
function lastReply(t: CommentThread): string | null {
  const replies = t.events.flatMap((e) => (e.type === 'reply' ? [e.text] : []));
  return replies.at(-1) ?? null;
}

/** Строка списка: статус, экран и компонент, время, текст, последний ответ ИИ. */
function ListItem(props: { readonly thread: CommentThread; readonly now: Date }) {
  const t = props.thread;
  const component = t.anchor.element?.component;
  const reply = lastReply(t);
  return (
    <button type="button" className="comments-list__item" data-testid="comments-list-item" data-comment-id={t.id} onClick={() => goToComment(t)}>
      <span className="comments-list__top">
        <CommentStatusBadge status={t.status} />
        <span className="comments-list__meta">{t.anchor.pageTitle}{component ? ` · ${component.name}` : ''}</span>
        <time dateTime={t.updatedAt}>{timeAgo(t.updatedAt, props.now)}</time>
      </span>
      <span className="comments-list__text">{t.text}</span>
      {reply === null ? null : <span className="comments-list__reply">Ответ ИИ: {reply}</span>}
    </button>
  );
}

/**
 * Правая панель всех замечаний.
 */
export function CommentsListPanel() {
  const open = useCommentsStore((s) => s.listOpen);
  const threads = useCommentsStore((s) => s.threads);
  const filter = useCommentsStore((s) => s.filter);
  const setOpen = useCommentsStore((s) => s.setListOpen);
  const shown = useMemo(() => filterThreads(threads, filter), [threads, filter]);
  if (!open) {
    return null;
  }
  const openCount = threads.filter((t) => t.status === 'open').length;
  const now = new Date();

  return (
    <aside className="drawer drawer--left ui-panel drawer--edge comments-list" data-testid="comments-list" aria-label="Все замечания">
      <div className="ui-panel__header">
        <div>
          <h2 className="ui-panel__title">Все замечания</h2>
          <p className="ui-panel__desc">Открыто {openCount} из {threads.length}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={() => setOpen(false)}>
          <X size={16} strokeWidth={1.75} />
        </Button>
      </div>
      <ListFilters />
      <div className="comments-list__items">
        {shown.length === 0 ? (
          <p className="drawer__hint comments-list__empty">{threads.length === 0 ? 'Замечаний пока нет. Выберите экран и нажмите C.' : 'Под фильтр ничего не подошло.'}</p>
        ) : (
          shown.map((t) => <ListItem key={t.id} thread={t} now={now} />)
        )}
      </div>
    </aside>
  );
}
