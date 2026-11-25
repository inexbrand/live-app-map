/**
 * Таблица сетки данных: липкая шапка с типами и сортировкой, строки с выбором и правками.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { DbCell, DbLiveColumn, DbRow, SortDir } from '@/lib/db-data/contract';
import { isRequiredColumn, type RowId } from '@/lib/db-data/edits';
import { DataGridCell, type CellHandlers } from './DataGridCell';

/** Строка сетки с учётом правок. */
export type GridRow = {
  readonly id: RowId;
  /** Строка с сервера; у новой — null. */
  readonly row: DbRow | null;
  /** Правки строки: у существующей — изменённые колонки, у новой — заданные. */
  readonly set: DbRow | undefined;
  readonly deleted: boolean;
};

/** Обработчики строк. */
export type RowHandlers = CellHandlers & {
  readonly onToggleSelect: (id: RowId) => void;
  readonly onRestore: (id: RowId) => void;
};

type RowProps = GridRow & {
  readonly columns: readonly DbLiveColumn[];
  readonly editable: boolean;
  readonly selected: boolean;
  readonly editingColumn: string | null;
  /** Ошибки ячеек строки: колонка → текст. */
  readonly errors: ReadonlyMap<string, string> | undefined;
  readonly handlers: RowHandlers;
};

function emptyLabel(isNew: boolean, column: DbLiveColumn): string {
  if (!isNew) {
    return 'NULL';
  }
  if (isRequiredColumn(column)) {
    return 'обязательно';
  }
  return column.hasDefault ? 'DEFAULT' : 'NULL';
}

const GridRowView = memo(function GridRowView(props: RowProps) {
  const { columns, handlers } = props;
  const item = props;
  const isNew = item.row === null;
  const set = item.set ?? {};
  return (
    <tr className={cn('dg-row', isNew && 'dg-row--new', item.deleted && 'dg-row--deleted', props.selected && 'dg-row--selected')} data-row-id={item.id}>
      {props.editable ? (
        <td className="dg-select">
          {item.deleted ? (
            <button type="button" className="dg-restore" onClick={() => handlers.onRestore(item.id)} title="Не удалять строку">
              вернуть
            </button>
          ) : (
            <input type="checkbox" aria-label="Выбрать строку" checked={props.selected} onChange={() => handlers.onToggleSelect(item.id)} />
          )}
        </td>
      ) : null}
      {columns.map((c) => {
        const own = Object.hasOwn(set, c.name);
        const value: DbCell = own ? (set[c.name] ?? null) : (item.row?.[c.name] ?? null);
        return (
          <DataGridCell
            key={c.name}
            id={item.id}
            column={c}
            value={value}
            changed={own}
            editing={props.editingColumn === c.name}
            editable={props.editable && !item.deleted}
            required={isNew && !own && isRequiredColumn(c)}
            emptyLabel={own ? 'NULL' : emptyLabel(isNew, c)}
            error={props.errors?.get(c.name)}
            handlers={handlers}
          />
        );
      })}
    </tr>
  );
});

/** Props таблицы. */
export type DataGridTableProps = {
  readonly columns: readonly DbLiveColumn[];
  readonly rows: readonly GridRow[];
  readonly primaryKey: readonly string[];
  readonly editable: boolean;
  readonly selected: ReadonlySet<RowId>;
  readonly editing: { readonly id: RowId; readonly column: string } | null;
  readonly errors: ReadonlyMap<RowId, ReadonlyMap<string, string>>;
  readonly sort: string | undefined;
  readonly dir: SortDir | undefined;
  readonly onSort: (column: string) => void;
  readonly onToggleAll: () => void;
  readonly handlers: RowHandlers;
};

function ariaSort(on: boolean, dir: SortDir | undefined): 'ascending' | 'descending' | 'none' {
  if (!on) {
    return 'none';
  }
  return dir === 'desc' ? 'descending' : 'ascending';
}

/** Таблица строк с шапкой. */
export function DataGridTable(props: DataGridTableProps) {
  const { columns, rows, selected, editing } = props;
  const selectable = rows.filter((r) => !r.deleted);
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  return (
    <table className="dg-table">
      <thead>
        <tr>
          {props.editable ? (
            <th className="dg-select">
              <input type="checkbox" aria-label="Выбрать все строки" checked={allOn} onChange={props.onToggleAll} />
            </th>
          ) : null}
          {columns.map((c) => {
            const on = props.sort === c.name;
            return (
              <th key={c.name} aria-sort={ariaSort(on, props.dir)}>
                <button type="button" className="dg-head" onClick={() => props.onSort(c.name)} title={`Сортировать по ${c.name}`}>
                  <span className="dg-head__name">
                    {props.primaryKey.includes(c.name) ? <span className="dg-head__pk">PK </span> : null}
                    {c.name}
                    {on ? <span aria-hidden="true">{props.dir === 'desc' ? ' ↓' : ' ↑'}</span> : null}
                  </span>
                  <span className="dg-head__type">
                    {c.type}
                    {isRequiredColumn(c) ? ' · обязательно' : ''}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <GridRowView
            key={r.id}
            id={r.id}
            row={r.row}
            set={r.set}
            deleted={r.deleted}
            columns={columns}
            editable={props.editable}
            selected={selected.has(r.id)}
            editingColumn={editing !== null && editing.id === r.id ? editing.column : null}
            errors={props.errors.get(r.id)}
            handlers={props.handlers}
          />
        ))}
      </tbody>
    </table>
  );
}
