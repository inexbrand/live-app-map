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
import { Button, Input, Select } from '../../ui';
import { CommentStatusBadge } from './CommentStatusBadge';

const STATUSES: ReadonlyArray<{ readonly id: CommentListFilter['status']; readonly label: string }> = [
  { id: 'open', label: 'Открытые' },
  { id: 'fixed', label: 'Исправленные' },
  { id: 'all', label: 'Все' },
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
  // Живой iframe появляется после перехода камеры — несколько попыток
  let tries = 0;
  const tick = (): void => {
    tries++;
    if (!flashElement(t.anchor.pageId, el.selector) && tries < 8) {
      window.setTimeout(tick, 500);
    }
  };
  window.setTimeout(tick, 600);
}

/**
 * Правая панель всех замечаний.
 */
export function CommentsListPanel() {
  const open = useCommentsStore((s) => s.listOpen);
  const threads = useCommentsStore((s) => s.threads);
  const filter = useCommentsStore((s) => s.filter);
  const setFilter = useCommentsStore((s) => s.setFilter);
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
      <div className="comments-list__filters">
        <div className="mode-seg" role="radiogroup" aria-label="Статус">
          {STATUSES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={filter.status === s.id} className={`mode-seg__btn${filter.status === s.id ? ' mode-seg__btn--on' : ''}`} onClick={() => setFilter({ status: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="comments-list__row">
          <Select aria-label="Автор" value={filter.author} onChange={(e) => setFilter({ author: e.target.value === 'user' ? 'user' : e.target.value === 'agent' ? 'agent' : 'all' })}>
            <option value="all">Все авторы</option>
            <option value="user">Мои</option>
            <option value="agent">От ИИ</option>
          </Select>
          <Input aria-label="Поиск по замечаниям" placeholder="Текст, экран, компонент" value={filter.query} onChange={(e) => setFilter({ query: e.target.value })} />
        </div>
      </div>
      <div className="comments-list__items">
        {shown.length === 0 ? (
          <p className="drawer__hint comments-list__empty">{threads.length === 0 ? 'Замечаний пока нет. Выберите экран и нажмите C.' : 'Под фильтр ничего не подошло.'}</p>
        ) : (
          shown.map((t) => (
            <button key={t.id} type="button" className="comments-list__item" data-testid="comments-list-item" data-comment-id={t.id} onClick={() => goToComment(t)}>
              <span className="comments-list__top">
                <CommentStatusBadge status={t.status} />
                <span className="comments-list__meta">{t.anchor.pageTitle}{t.anchor.element?.component ? ` · ${t.anchor.element.component.name}` : ''}</span>
                <time dateTime={t.updatedAt}>{timeAgo(t.updatedAt, now)}</time>
              </span>
              <span className="comments-list__text">{t.text}</span>
              {t.events.some((e) => e.type === 'reply') ? <span className="comments-list__reply">Ответ ИИ: {t.events.filter((e) => e.type === 'reply').map((e) => (e.type === 'reply' ? e.text : '')).at(-1)}</span> : null}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
