/**
 * Лист «Все замечания»: поверх холста справа, открывается кнопкой шапки, ⇧C или
 * «N открыто» под экраном. Группы: черновики, проверьте, ждут агента,
 * исправлено (свёрнуто). J/K — выбрать, Enter — открыть на экране, A — принять,
 * N — вернуть агенту, Esc — закрыть.
 */
import type { CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { goToComment, openAnchor } from '../../lib/comments/go-to-comment';
import { isTypingTarget } from '../../lib/typing-target';
import { useAppStore } from '../../store/app-store';
import { groupByStage, useCommentsStore, type CommentDraft } from '../../store/comments-store';
import { OptionSelect } from '../option-select';
import { ThreadCard } from './ThreadCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** «Экран · Компонент» для строки листа. */
function whereOf(anchor: CommentThread['anchor']): string {
  const c = anchor.element?.component?.name ?? anchor.element?.tag ?? '';
  return c === '' ? anchor.pageTitle : `${anchor.pageTitle} · ${c}`;
}

/** Пункт «Все экраны»: пустое значение выбор считает «ничего не выбрано» и не подписывает. */
const ALL_PAGES = '*';

/** Экраны с замечаниями для фильтра. */
function pageItems(threads: readonly CommentThread[]): { readonly value: string; readonly label: string }[] {
  const seen = new Map<string, string>();
  for (const t of threads) {
    seen.set(t.anchor.pageId, t.anchor.pageTitle);
  }
  return [{ value: ALL_PAGES, label: 'Все экраны' }, ...[...seen].map(([value, label]) => ({ value, label }))];
}

function Group(props: { readonly title: string; readonly threads: readonly CommentThread[]; readonly active: string | null }) {
  if (props.threads.length === 0) {
    return null;
  }
  return (
    <section className="comments-sheet__group" aria-label={props.title}>
      <h3 className="comments-sheet__title">
        {props.title} · {props.threads.length}
      </h3>
      {props.threads.map((t) => (
        <div
          key={t.id}
          className={`comments-sheet__item${t.id === props.active ? ' comments-sheet__item--active' : ''}`}
          data-testid="sheet-item"
          data-comment-id={t.id}
          onClick={(e) => {
            if (!(e.target instanceof HTMLElement && e.target.closest('button, input, form') !== null)) {
              goToComment(t);
            }
          }}
        >
          <ThreadCard thread={t} focused={false} where={whereOf(t.anchor)} />
        </div>
      ))}
    </section>
  );
}

function Drafts(props: { readonly drafts: readonly CommentDraft[] }) {
  if (props.drafts.length === 0) {
    return null;
  }
  return (
    <section className="comments-sheet__group" aria-label="Черновики">
      <h3 className="comments-sheet__title">Черновики · не отправлены</h3>
      {props.drafts.map((d) => (
        <button
          key={`${d.anchor.pageId}|${d.anchor.element?.selector ?? ''}`}
          type="button"
          className="comments-sheet__draft"
          data-testid="sheet-draft"
          onClick={() => {
            useCommentsStore.getState().closeSheet();
            openAnchor(d.anchor, d.frame);
          }}
        >
          <span className="comment-thread__where">{whereOf(d.anchor)}</span>
          <span className="comments-sheet__draft-text">{d.text}</span>
        </button>
      ))}
    </section>
  );
}

/** Следующее или предыдущее в списке по J/K. */
function step(list: readonly CommentThread[], active: string | null, by: number): string | null {
  const i = list.findIndex((t) => t.id === active);
  return list[Math.max(0, Math.min(list.length - 1, i + by))]?.id ?? null;
}

/** Действие клавиши над выбранным замечанием; false — клавиша не наша. */
function actOn(k: string, cur: CommentThread | undefined): boolean {
  const store = useCommentsStore.getState();
  if (k === 'enter' && cur !== undefined) {
    goToComment(cur);
    return true;
  }
  if ((k === 'a' || k === 'ф') && cur?.stage === 'review') {
    void store.review(cur.id, { kind: 'accept' });
    return true;
  }
  if ((k === 'n' || k === 'т') && cur !== undefined && cur.stage !== 'waiting') {
    void store.review(cur.id, { kind: 'reject', note: null });
    return true;
  }
  return false;
}

/** Клавиши листа: J/K, Enter, A, N, Esc (в полях ввода — только Esc). */
function sheetKey(e: KeyboardEvent, list: readonly CommentThread[], active: string | null, setActive: (id: string | null) => void): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    useCommentsStore.getState().closeSheet();
    return;
  }
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
    return;
  }
  const k = e.key.toLowerCase();
  const by = k === 'j' || k === 'о' ? 1 : k === 'k' || k === 'л' ? -1 : 0;
  if (by !== 0) {
    setActive(step(list, active, by));
    e.preventDefault();
    return;
  }
  if (actOn(k, list.find((t) => t.id === active))) {
    e.preventDefault();
  }
}

function SheetBody() {
  const threads = useCommentsStore((s) => s.threads);
  const drafts = useCommentsStore((s) => s.drafts);
  const page = useCommentsStore((s) => s.sheetPage);
  const query = useCommentsStore((s) => s.query);
  const mapName = useAppStore((s) => s.document?.project.name ?? null);
  const [active, setActive] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const groups = useMemo(() => groupByStage(threads, page, query), [threads, page, query]);
  const myDrafts = [...drafts.values()].filter((d) => d.anchor.mapName === mapName && (page === null || d.anchor.pageId === page));
  const keyed = [...groups.review, ...groups.waiting, ...(showDone ? groups.done : [])];
  const store = useCommentsStore.getState();
  const empty = keyed.length + myDrafts.length + groups.done.length === 0;
  return (
    <aside className="comments-sheet ui-panel" data-testid="comments-sheet" aria-label="Все замечания" tabIndex={-1} onKeyDown={(e) => sheetKey(e, keyed, active, setActive)}>
      <header className="comments-sheet__head">
        <div>
          <h2 className="comments-sheet__h">Все замечания</h2>
          <p className="comments-sheet__sum">
            Проверить: {groups.review.length} · Ждут агента: {groups.waiting.length} · Исправлено: {groups.done.length}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={store.closeSheet}>
          <X size={16} strokeWidth={1.75} />
        </Button>
      </header>
      <div className="comments-sheet__filters">
        <OptionSelect aria-label="Экран" size="sm" className="w-44 shrink-0" items={pageItems(threads)} value={page ?? ALL_PAGES} onValueChange={(v) => store.openSheet(v === ALL_PAGES ? null : v)} />
        <Input aria-label="Поиск по замечаниям" placeholder="Текст, экран, компонент" value={query} onChange={(e) => store.setQuery(e.target.value)} />
      </div>
      <div className="comments-sheet__list">
        <Drafts drafts={myDrafts} />
        <Group title="Проверьте" threads={groups.review} active={active} />
        <Group title="Ждут агента" threads={groups.waiting} active={active} />
        {groups.done.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="self-start" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            Исправлено · {groups.done.length}
          </Button>
        ) : null}
        {showDone ? <Group title="Исправлено" threads={groups.done} active={active} /> : null}
        {empty ? <p className="comments-sheet__empty">{threads.length === 0 ? 'Замечаний пока нет. Выберите экран и нажмите на компонент.' : 'Под фильтр ничего не подошло.'}</p> : null}
      </div>
      <p className="comments-sheet__keys">J K — выбрать · Enter — открыть · A — принять · N — вернуть агенту</p>
    </aside>
  );
}

/**
 * Лист всех замечаний карты.
 */
export function CommentsSheet() {
  const open = useCommentsStore((s) => s.sheetOpen);
  return open ? <SheetBody /> : null;
}
