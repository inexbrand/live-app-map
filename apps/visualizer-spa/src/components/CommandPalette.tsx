/**
 * Глобальный поиск (⌘K, Ctrl+K, /): экраны, роуты, таблицы, эпохи, документы, файлы
 * одним списком плюс быстрые действия. Стрелки — выбор, Enter — переход, Esc — закрыть.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { buildSearchIndex, SEARCH_KIND_LABELS, searchIndex, type SearchItem } from '../lib/global-search';
import { toggleTheme } from '../lib/theme';
import { useOpenTarget } from '../lib/use-open-target';
import { useAppStore } from '../store/app-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useUiStore } from '../store/ui-store';
import { useViewStore, type AppView } from '../store/view-store';

/** Строка палитры: результат поиска или действие. */
type Row =
  | { readonly type: 'item'; readonly item: SearchItem }
  | { readonly type: 'action'; readonly id: string; readonly title: string; readonly hint: string; readonly run: () => void };

/** Подпись строки для группы. */
function groupOf(r: Row): string {
  return r.type === 'action' ? 'Действия' : (SEARCH_KIND_LABELS.get(r.item.kind) ?? '');
}

/** Быстрые действия палитры. */
function actions(query: string, hasDocs: boolean): Row[] {
  const view = (v: AppView) => () => useViewStore.getState().setView(v);
  const out: Row[] = [];
  const q = query.trim();
  if (q !== '') {
    out.push({
      type: 'action',
      id: 'filter-canvas',
      title: `Оставить на холсте экраны «${q}»`,
      hint: 'фильтр холста',
      run: () => {
        useAppStore.getState().setSearchQuery(q);
        useViewStore.getState().setView('screens');
      },
    });
    return out;
  }
  out.push(
    { type: 'action', id: 'v-screens', title: 'Экраны', hint: '1', run: view('screens') },
    { type: 'action', id: 'v-api', title: 'API', hint: '2', run: view('api') },
    { type: 'action', id: 'v-db', title: 'База данных', hint: '3', run: view('database') },
    { type: 'action', id: 'v-docs', title: 'Документация', hint: '4', run: view('docs') },
  );
  if (hasDocs) {
    out.push(
      { type: 'action', id: 'graph', title: 'Граф документации', hint: 'G', run: () => useViewStore.getState().setDocsMode('graph') },
      {
        type: 'action',
        id: 'not-ready',
        title: 'Незакрытые эпохи на графе',
        hint: 'готовность',
        run: () => {
          useDocGraphStore.getState().setReadiness('not-ready');
          useViewStore.getState().setDocsMode('graph');
        },
      },
    );
  }
  if (useAppStore.getState().searchQuery.trim() !== '') {
    out.push({ type: 'action', id: 'clear-filter', title: 'Показать все экраны', hint: 'сбросить фильтр холста', run: () => useAppStore.getState().setSearchQuery('') });
  }
  out.push(
    { type: 'action', id: 'theme', title: 'Сменить тему', hint: 'T', run: () => void toggleTheme() },
    { type: 'action', id: 'help', title: 'Горячие клавиши', hint: '?', run: () => useUiStore.getState().setHelp(true) },
  );
  return out;
}

/** Перейти к строке: действие выполняется, результат открывается. */
function useRunRow(): (r: Row | undefined) => void {
  const setOpen = useUiStore((s) => s.setPalette);
  const openTarget = useOpenTarget();
  return (r) => {
    if (r === undefined) {
      return;
    }
    setOpen(false);
    if (r.type === 'action') {
      r.run();
    } else {
      openTarget(r.item.target);
    }
  };
}

/** Стрелки — выбор, Enter — переход, Esc — закрыть. */
function paletteKey(e: React.KeyboardEvent, rowCount: number, setActive: (f: (a: number) => number) => void, enter: () => void, close: () => void): void {
  const moves: Record<string, (a: number) => number> = {
    ArrowDown: (a) => Math.min(rowCount - 1, a + 1),
    ArrowUp: (a) => Math.max(0, a - 1),
  };
  const move = moves[e.key];
  if (move !== undefined) {
    e.preventDefault();
    setActive(move);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    enter();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

/** Строка списка с заголовком группы перед первой строкой группы. */
function PaletteRow({ r, i, prev, active, onHover, onRun }: { readonly r: Row; readonly i: number; readonly prev: Row | undefined; readonly active: boolean; readonly onHover: () => void; readonly onRun: () => void }) {
  const group = groupOf(r);
  const head = prev === undefined || groupOf(prev) !== group;
  const title = r.type === 'item' ? r.item.title : r.title;
  const hint = r.type === 'item' ? r.item.detail : r.hint;
  return (
    <li role="presentation">
      {head ? <p className="palette__group">{group}</p> : null}
      <button
        type="button"
        id={`palette-row-${i}`}
        role="option"
        aria-selected={active}
        className={`palette__row${active ? ' palette__row--on' : ''}`}
        data-testid="palette-row"
        data-kind={r.type === 'item' ? r.item.kind : 'action'}
        onMouseMove={onHover}
        onClick={onRun}
      >
        <span className="palette__title">{title}</span>
        <span className={r.type === 'action' ? 'palette__kbd' : 'palette__hint'}>{hint}</span>
      </button>
    </li>
  );
}

/** Строки палитры по запросу: результаты поиска, затем действия. */
function usePaletteRows(query: string): { readonly rows: Row[]; readonly hasMap: boolean } {
  const doc = useAppStore((s) => s.document);
  const index = useMemo(() => (doc === null ? [] : buildSearchIndex(doc)), [doc]);
  const rows = useMemo<Row[]>(() => {
    const items = searchIndex(index, query).map((item): Row => ({ type: 'item', item }));
    return [...items, ...actions(query, doc?.docs !== undefined)];
  }, [index, query, doc]);
  return { rows, hasMap: doc !== null };
}

/** Запрос есть, а нашлись только действия. */
function nothingFound(query: string, rows: readonly Row[]): boolean {
  return query.trim() !== '' && rows.every((r) => r.type === 'action');
}

function activeRowId(rows: readonly Row[], active: number): string | undefined {
  return rows[active] === undefined ? undefined : `palette-row-${active}`;
}

/** Глобальный поиск. */
export function CommandPalette() {
  const open = useUiStore((s) => s.palette);
  const setOpen = useUiStore((s) => s.setPalette);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { rows, hasMap } = usePaletteRows(query);
  const run = useRunRow();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) {
    return null;
  }
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Поиск по проекту"
        data-testid="palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <label className="palette__field">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            autoFocus
            className="palette__input"
            data-testid="palette-input"
            value={query}
            placeholder={hasMap ? 'Экран, роут, таблица, эпоха, документ, файл' : 'Сначала откройте карту'}
            aria-controls="palette-list"
            aria-activedescendant={activeRowId(rows, active)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => paletteKey(e, rows.length, setActive, () => run(rows[active]), () => setOpen(false))}
          />
          <kbd className="palette__kbd">Esc</kbd>
        </label>
        <ul className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {nothingFound(query, rows) ? (
            <li className="palette__empty">Ничего не нашлось. Проверьте написание или ищите по части пути: «vacancies», «/me».</li>
          ) : null}
          {rows.map((r, i) => (
            <PaletteRow key={r.type === 'item' ? r.item.id : r.id} r={r} i={i} prev={rows[i - 1]} active={i === active} onHover={() => setActive(i)} onRun={() => run(r)} />
          ))}
        </ul>
      </div>
    </div>
  );
}
