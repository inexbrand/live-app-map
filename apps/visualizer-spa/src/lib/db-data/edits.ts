/**
 * Накопленные правки сетки данных (без React): правки ячеек существующих строк по ключу PK,
 * новые строки, пометки на удаление и сборка пакета {@link DbChanges} для «Сохранить».
 * Все функции чистые: возвращают новое состояние, старое не меняют.
 */
import type { DbCell, DbChanges, DbLiveColumn, DbRow } from './contract';

/** Идентификатор строки в сетке: JSON значений PK или `new:<n>` у новой строки. */
export type RowId = string;

/** Правка существующей строки. */
export type RowEdit = {
  /** Значения PK строки. */
  readonly key: DbRow;
  /** Строка, как её прислал сервер. */
  readonly original: DbRow;
  /** Изменённые колонки → новое значение. */
  readonly set: DbRow;
};

/** Новая строка: только заданные колонки (остальные — DEFAULT). */
export type NewRow = {
  readonly id: RowId;
  readonly values: DbRow;
};

/** Все несохранённые правки одной таблицы. */
export type PendingEdits = {
  readonly updates: ReadonlyMap<RowId, RowEdit>;
  /** Новые строки, свежая — первой. */
  readonly inserts: readonly NewRow[];
  /** Удаляемые строки → значения PK. */
  readonly deletes: ReadonlyMap<RowId, DbRow>;
  readonly nextNewId: number;
};

/** Пустая ячейка новой строки, которую нельзя оставить пустой. */
export type MissingCell = {
  readonly id: RowId;
  readonly column: string;
};

/** Итог сборки пакета: пакет или незаполненные обязательные ячейки. */
export type BuildResult =
  | { readonly ok: true; readonly changes: DbChanges }
  | { readonly ok: false; readonly missing: readonly MissingCell[] };

const NEW_ROW_PREFIX = 'new:';

/** Правок нет. */
export function emptyEdits(): PendingEdits {
  return { updates: new Map(), inserts: [], deletes: new Map(), nextNewId: 1 };
}

/** Новая ли это строка (ещё нет в БД). */
export function isNewRowId(id: RowId): boolean {
  return id.startsWith(NEW_ROW_PREFIX);
}

/**
 * Значения PK строки.
 *
 * @param row - строка с сервера
 * @param primaryKey - колонки PK (не пусто)
 */
export function rowKey(row: DbRow, primaryKey: readonly string[]): DbRow {
  if (primaryKey.length === 0) {
    throw new Error('у таблицы нет первичного ключа: строку нельзя адресовать');
  }
  const key: Record<string, DbCell> = {};
  for (const column of primaryKey) {
    const value = row[column];
    if (value === undefined) {
      throw new Error(`в строке нет колонки первичного ключа ${column}`);
    }
    key[column] = value;
  }
  return key;
}

/** Идентификатор существующей строки по её PK. */
export function rowIdOf(row: DbRow, primaryKey: readonly string[]): RowId {
  const key = rowKey(row, primaryKey);
  return JSON.stringify(primaryKey.map((c) => key[c]));
}

function without<V>(map: ReadonlyMap<RowId, V>, id: RowId): Map<RowId, V> {
  const next = new Map(map);
  next.delete(id);
  return next;
}

function omit(row: DbRow, column: string): DbRow {
  const next: Record<string, DbCell> = { ...row };
  delete next[column];
  return next;
}

/**
 * Правка ячейки существующей строки. Значение, равное исходному, снимает правку колонки.
 *
 * @param edits - текущие правки
 * @param row - строка с сервера
 * @param primaryKey - колонки PK
 * @param column - колонка
 * @param value - новое значение (текст Postgres или null)
 */
export function editCell(edits: PendingEdits, row: DbRow, primaryKey: readonly string[], column: string, value: DbCell): PendingEdits {
  const id = rowIdOf(row, primaryKey);
  const prev = edits.updates.get(id);
  const base = prev ?? { key: rowKey(row, primaryKey), original: row, set: {} };
  const set = base.original[column] === value ? omit(base.set, column) : { ...base.set, [column]: value };
  if (Object.keys(set).length === 0) {
    return prev === undefined ? edits : { ...edits, updates: without(edits.updates, id) };
  }
  const updates = new Map(edits.updates);
  updates.set(id, { ...base, set });
  return { ...edits, updates };
}

/** Добавить пустую новую строку первой; возвращает правки и id строки. */
export function addNewRow(edits: PendingEdits): { readonly edits: PendingEdits; readonly id: RowId } {
  const id = `${NEW_ROW_PREFIX}${edits.nextNewId}`;
  return { id, edits: { ...edits, inserts: [{ id, values: {} }, ...edits.inserts], nextNewId: edits.nextNewId + 1 } };
}

/**
 * Значение ячейки новой строки; пустой текст снимает значение (колонка получит DEFAULT).
 *
 * @param edits - текущие правки
 * @param id - id новой строки
 * @param column - колонка
 * @param value - значение
 */
export function editNewRow(edits: PendingEdits, id: RowId, column: string, value: DbCell): PendingEdits {
  if (!edits.inserts.some((r) => r.id === id)) {
    throw new Error(`нет новой строки ${id}`);
  }
  const inserts = edits.inserts.map((r) => {
    if (r.id !== id) {
      return r;
    }
    return { id, values: value === '' ? omit(r.values, column) : { ...r.values, [column]: value } };
  });
  return { ...edits, inserts };
}

/** Убрать новую строку. */
export function removeNewRow(edits: PendingEdits, id: RowId): PendingEdits {
  return { ...edits, inserts: edits.inserts.filter((r) => r.id !== id) };
}

/**
 * Пометить строки на удаление; новые строки среди них просто убираются.
 *
 * @param edits - текущие правки
 * @param rows - выбранные строки: id и строка с сервера (у новой — null)
 * @param primaryKey - колонки PK
 */
export function markDeleted(edits: PendingEdits, rows: readonly { readonly id: RowId; readonly row: DbRow | null }[], primaryKey: readonly string[]): PendingEdits {
  const deletes = new Map(edits.deletes);
  let inserts = edits.inserts;
  for (const { id, row } of rows) {
    if (isNewRowId(id)) {
      inserts = inserts.filter((r) => r.id !== id);
    } else if (row !== null) {
      deletes.set(id, rowKey(row, primaryKey));
    }
  }
  return { ...edits, deletes, inserts };
}

/** Снять пометку удаления. */
export function restoreRow(edits: PendingEdits, id: RowId): PendingEdits {
  return edits.deletes.has(id) ? { ...edits, deletes: without(edits.deletes, id) } : edits;
}

/** Отменить правку одной ячейки (существующей или новой строки). */
export function undoCell(edits: PendingEdits, id: RowId, column: string): PendingEdits {
  if (isNewRowId(id)) {
    return { ...edits, inserts: edits.inserts.map((r) => (r.id === id ? { id, values: omit(r.values, column) } : r)) };
  }
  const prev = edits.updates.get(id);
  if (prev === undefined || !(column in prev.set)) {
    return edits;
  }
  const set = omit(prev.set, column);
  if (Object.keys(set).length === 0) {
    return { ...edits, updates: without(edits.updates, id) };
  }
  const updates = new Map(edits.updates);
  updates.set(id, { ...prev, set });
  return { ...edits, updates };
}

/** Сколько правок: изменённые ячейки, новые и удаляемые строки. */
export function editCount(edits: PendingEdits): number {
  let cells = 0;
  for (const [id, u] of edits.updates) {
    if (!edits.deletes.has(id)) {
      cells += Object.keys(u.set).length;
    }
  }
  return cells + edits.inserts.length + edits.deletes.size;
}

/** Колонка обязательна при вставке: NOT NULL и без DEFAULT. */
export function isRequiredColumn(column: DbLiveColumn): boolean {
  return !column.nullable && !column.hasDefault;
}

/**
 * Пакет правок для сохранения. Новая строка с пустой обязательной колонкой — пакет не собирается.
 *
 * @param table - имя таблицы в БД
 * @param edits - накопленные правки
 * @param columns - колонки таблицы
 */
export function buildChanges(table: string, edits: PendingEdits, columns: readonly DbLiveColumn[]): BuildResult {
  const required = columns.filter(isRequiredColumn);
  const missing: MissingCell[] = [];
  for (const r of edits.inserts) {
    for (const c of required) {
      const v = r.values[c.name];
      if (v === undefined || v === null) {
        missing.push({ id: r.id, column: c.name });
      }
    }
  }
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  const updates = [...edits.updates]
    .filter(([id]) => !edits.deletes.has(id))
    .map(([, u]) => ({ key: u.key, set: u.set }));
  return {
    ok: true,
    changes: {
      table,
      inserts: [...edits.inserts].reverse().map((r) => r.values),
      updates,
      deletes: [...edits.deletes.values()],
    },
  };
}
