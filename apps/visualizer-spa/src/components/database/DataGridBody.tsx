/**
 * Строки одной таблицы: загрузка страницы, накопленные правки, сохранение пакетом.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DbDataClient } from '@/lib/db-data/client';
import { DB_PAGE_SIZE, type DbRow, type RowsPage, type SortDir } from '@/lib/db-data/contract';
import {
  addNewRow,
  buildChanges,
  editCell,
  editCount,
  editNewRow,
  emptyEdits,
  isNewRowId,
  markDeleted,
  restoreRow,
  rowIdOf,
  undoCell,
  type MissingCell,
  type RowId,
} from '@/lib/db-data/edits';
import { DataGridTable, type GridRow, type RowHandlers } from './DataGridTable';
import { DataGridPager, DataGridToolbar, type GridFilter } from './DataGridToolbar';

/** Текст ошибки для человека. */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Спросить, можно ли отбросить несохранённые правки.
 *
 * @param count - число правок
 */
export function confirmDiscard(count: number): boolean {
  return count === 0 || window.confirm(`Несохранённых правок: ${count}. Отбросить их?`);
}

type Query = {
  readonly page: number;
  readonly sort?: string;
  readonly dir?: SortDir;
  readonly filter: GridFilter | null;
};

/** Props строк таблицы. */
export type TableGridProps = {
  readonly table: string;
  readonly client: DbDataClient;
  /** Почему БД только для чтения; null — запись разрешена. */
  readonly readOnly: string | null;
  readonly onDirtyChange: ((count: number) => void) | undefined;
};

function groupMissing(missing: readonly MissingCell[]): Map<RowId, Map<string, string>> {
  const out = new Map<RowId, Map<string, string>>();
  for (const m of missing) {
    const row = out.get(m.id) ?? new Map<string, string>();
    row.set(m.column, `заполните ${m.column}`);
    out.set(m.id, row);
  }
  return out;
}

/** Строки таблицы с панелью и страницами. */
export function TableGrid(props: TableGridProps) {
  const { table, client } = props;
  const [query, setQuery] = useState<Query>({ page: 0, filter: null });
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<RowsPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [edits, setEdits] = useState(emptyEdits);
  const [selected, setSelected] = useState<ReadonlySet<RowId>>(() => new Set());
  const [editing, setEditing] = useState<{ readonly id: RowId; readonly column: string } | null>(null);
  const [cellErrors, setCellErrors] = useState<ReadonlyMap<RowId, ReadonlyMap<string, string>>>(() => new Map());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBusy(true);
    const f = query.filter;
    client
      .rows({ table, page: query.page, size: DB_PAGE_SIZE, sort: query.sort, dir: query.dir, filterColumn: f?.column, filterValue: f?.value })
      .then(
        (page) => {
          if (live) {
            setData(page);
            setLoadError(null);
          }
        },
        (e: unknown) => live && setLoadError(messageOf(e)),
      )
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [client, table, query, reload]);

  const pk = data?.primaryKey ?? [];
  const readOnly = props.readOnly ?? (data !== null && pk.length === 0 ? 'у таблицы нет первичного ключа — только чтение' : null);
  const editable = readOnly === null && data !== null;
  const count = editCount(edits);

  const rowsById = useRef(new Map<RowId, DbRow>());
  const rows = useMemo((): GridRow[] => {
    const byId = new Map<RowId, DbRow>();
    const server = (data?.rows ?? []).map((row, i): GridRow => {
      const id = pk.length === 0 ? `row:${i}` : rowIdOf(row, pk);
      byId.set(id, row);
      return { id, row, set: edits.updates.get(id)?.set, deleted: edits.deletes.has(id) };
    });
    rowsById.current = byId;
    return [...edits.inserts.map((n): GridRow => ({ id: n.id, row: null, set: n.values, deleted: false })), ...server];
  }, [data, pk, edits]);

  const pkRef = useRef(pk);
  pkRef.current = pk;
  const handlers = useMemo((): RowHandlers => {
    const clearError = (id: RowId, column: string): void =>
      setCellErrors((prev) => {
        const row = prev.get(id);
        if (row === undefined || !row.has(column)) {
          return prev;
        }
        const next = new Map(prev);
        const cells = new Map(row);
        cells.delete(column);
        next.set(id, cells);
        return next;
      });
    return {
      onStartEdit: (id, column) => setEditing({ id, column }),
      onCancel: () => setEditing(null),
      onCommit: (id, column, value) => {
        const row = rowsById.current.get(id);
        if (isNewRowId(id)) {
          setEdits((e) => editNewRow(e, id, column, value));
        } else if (row !== undefined) {
          setEdits((e) => editCell(e, row, pkRef.current, column, value));
        }
        clearError(id, column);
        setEditing(null);
      },
      onUndo: (id, column) => {
        setEdits((e) => undoCell(e, id, column));
        setEditing(null);
      },
      onToggleSelect: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (!next.delete(id)) {
            next.add(id);
          }
          return next;
        }),
      onRestore: (id) => setEdits((e) => restoreRow(e, id)),
    };
  }, []);

  useEffect(() => props.onDirtyChange?.(count), [count, props.onDirtyChange]);
  useEffect(() => {
    if (count === 0) {
      return undefined;
    }
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [count]);

  const discardAll = (): void => {
    setEdits(emptyEdits());
    setSelected(new Set());
    setEditing(null);
    setCellErrors(new Map());
    setSaveError(null);
  };
  /** Действие, перечитывающее строки: при правках — после подтверждения. */
  const guarded = (action: () => void): void => {
    if (!confirmDiscard(count)) {
      return;
    }
    discardAll();
    setNotice(null);
    action();
  };
  const onSort = (column: string): void =>
    guarded(() => setQuery((q) => ({ ...q, page: 0, sort: column, dir: q.sort === column && q.dir === 'asc' ? 'desc' : 'asc' })));
  const save = (): void => {
    if (data === null) {
      return;
    }
    const built = buildChanges(table, edits, data.columns);
    if (!built.ok) {
      setCellErrors(groupMissing(built.missing));
      const names = [...new Set(built.missing.map((m) => m.column))].join(', ');
      setSaveError(`Заполните обязательные поля новых строк: ${names}`);
      return;
    }
    setBusy(true);
    setSaveError(null);
    client.applyChanges(built.changes).then(
      (r) => {
        discardAll();
        setNotice(`Сохранено: добавлено ${r.inserted}, изменено ${r.updated}, удалено ${r.deleted}`);
        setReload((n) => n + 1);
      },
      (e: unknown) => {
        setSaveError(messageOf(e));
        setBusy(false);
      },
    );
  };

  return (
    <div className="dg" data-testid="data-grid">
      <DataGridToolbar
        table={table}
        total={data?.total ?? null}
        columns={data?.columns ?? []}
        filter={query.filter}
        editable={editable}
        selectedCount={selected.size}
        editCount={count}
        busy={busy}
        onFilter={(filter) => guarded(() => setQuery((q) => ({ ...q, page: 0, filter })))}
        onAdd={() => setEdits((e) => addNewRow(e).edits)}
        onDeleteSelected={() => {
          setEdits((e) => markDeleted(e, [...selected].map((id) => ({ id, row: rowsById.current.get(id) ?? null })), pk));
          setSelected(new Set());
        }}
        onReset={discardAll}
        onSave={save}
        onRefresh={() => guarded(() => setReload((n) => n + 1))}
      />
      {readOnly === null ? null : <p className="dg-readonly">Только чтение: {readOnly}</p>}
      {saveError === null ? null : <p className="dg-error" role="alert">{saveError}</p>}
      {loadError === null ? null : <p className="dg-error" role="alert">{loadError}</p>}
      {notice === null ? null : <p className="dg-notice" role="status">{notice}</p>}
      <div className="dg__scroll">
        {data === null ? null : (
          <DataGridTable
            columns={data.columns}
            rows={rows}
            primaryKey={pk}
            editable={editable}
            selected={selected}
            editing={editing}
            errors={cellErrors}
            sort={query.sort}
            dir={query.dir}
            onSort={onSort}
            onToggleAll={() => {
              const ids = rows.filter((r) => !r.deleted).map((r) => r.id);
              setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
            }}
            handlers={handlers}
          />
        )}
      </div>
      {data === null ? null : <DataGridPager page={query.page} size={DB_PAGE_SIZE} total={data.total} onPage={(page) => guarded(() => setQuery((q) => ({ ...q, page })))} />}
    </div>
  );
}
