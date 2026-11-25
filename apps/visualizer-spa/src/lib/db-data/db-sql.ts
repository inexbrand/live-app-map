/**
 * Сборка SQL для живых данных БД: чистые функции, без подключения.
 *
 * Имена таблиц и колонок берутся только из интроспекции и экранируются; значения —
 * параметрами `$n` с приведением к базовому типу колонки (`$1::int4`), так Postgres сам
 * разбирает текст ячейки. Базовый тип без модификатора: `varchar(5)` не обрезает молча.
 */
import type { DbChanges, DbLiveColumn, DbRow, RowsQuery } from './contract';

/** Ошибка запроса с HTTP-кодом и текстом для человека. */
export class DbHttpError extends Error {
  /**
   * @param status - HTTP-код ответа
   * @param message - понятный текст
   */
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'DbHttpError';
  }
}

/** Колонка с тем, что нужно серверу: тип для приведения параметра. */
export type ColumnMeta = DbLiveColumn & {
  /** Базовый тип без модификатора (format_type(oid, NULL)): `integer`, `text[]`, `public."Role"`. */
  readonly castType: string;
};

/** Таблица по интроспекции. */
export type TableMeta = {
  readonly schema: string;
  readonly name: string;
  readonly columns: readonly ColumnMeta[];
  /** Колонки первичного ключа по порядку; пусто — ключа нет. */
  readonly primaryKey: readonly string[];
};

/** Запрос: текст и параметры. */
export type SqlStatement = { readonly text: string; readonly params: readonly (string | null)[] };

/** Запрос пакета правок и сколько строк он должен затронуть. */
export type ChangeStatement = SqlStatement & { readonly kind: 'insert' | 'update' | 'delete'; readonly expected: number };

/** Предел параметров в одном запросе Postgres — 65535; берём с запасом. */
export const MAX_PARAMS = 60_000;

/**
 * Экранирует идентификатор Postgres: `a"b` → `"a""b"`.
 *
 * @param name - имя таблицы, схемы или колонки
 */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Полное имя таблицы: `"схема"."таблица"`. */
export function qualifiedName(meta: TableMeta): string {
  return `${quoteIdent(meta.schema)}.${quoteIdent(meta.name)}`;
}

/**
 * Колонка по имени или 400 «нет колонки».
 *
 * @param meta - таблица
 * @param name - имя колонки из запроса
 */
export function columnOf(meta: TableMeta, name: string): ColumnMeta {
  const col = meta.columns.find((c) => c.name === name);
  if (col === undefined) {
    throw new DbHttpError(400, `нет колонки ${name} в таблице ${meta.name}`);
  }
  return col;
}

/** Копилка параметров: `add(v, тип)` → `$n::тип`. */
class Params {
  readonly list: (string | null)[] = [];

  add(value: string | null, castType?: string): string {
    this.list.push(value);
    if (this.list.length > MAX_PARAMS) {
      throw new DbHttpError(400, `слишком большой пакет: больше ${MAX_PARAMS} значений — сохраните частями`);
    }
    const ref = `$${this.list.length}`;
    return castType === undefined ? ref : `${ref}::${castType}`;
  }
}

/**
 * Запросы страницы: строки (все колонки текстом) и число строк с учётом фильтра.
 *
 * @param meta - таблица
 * @param q - запрос страницы
 * @returns запрос строк и запрос количества
 */
export function buildPageQueries(meta: TableMeta, q: RowsQuery): { readonly rows: SqlStatement; readonly count: SqlStatement } {
  const params = new Params();
  if ((q.filterColumn === undefined) !== (q.filterValue === undefined)) {
    throw new DbHttpError(400, 'фильтр задаётся парой filterColumn и filterValue');
  }
  const where = q.filterColumn === undefined ? '' : ` WHERE ${quoteIdent(columnOf(meta, q.filterColumn).name)}::text = ${params.add(q.filterValue ?? null)}`;
  const sortCol = q.sort === undefined ? null : columnOf(meta, q.sort).name;
  const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
  // Ключ добивает порядок: без него строки с равным значением сортировки скачут между страницами.
  const order = [...(sortCol === null ? [] : [`${quoteIdent(sortCol)} ${dir}`]), ...meta.primaryKey.filter((k) => k !== sortCol).map((k) => `${quoteIdent(k)} ASC`)];
  const select = meta.columns.map((c) => `${quoteIdent(c.name)}::text AS ${quoteIdent(c.name)}`).join(', ');
  const from = `FROM ${qualifiedName(meta)}${where}`;
  return {
    rows: {
      text: `SELECT ${select} ${from}${order.length === 0 ? '' : ` ORDER BY ${order.join(', ')}`} LIMIT ${q.size} OFFSET ${q.page * q.size}`,
      params: params.list,
    },
    count: { text: `SELECT count(*)::text AS total ${from}`, params: params.list },
  };
}

/** Колонки строки в порядке таблицы (проверка имён). */
function rowColumns(meta: TableMeta, row: DbRow): ColumnMeta[] {
  for (const name of Object.keys(row)) {
    columnOf(meta, name);
  }
  return meta.columns.filter((c) => Object.hasOwn(row, c.name));
}

/** Группы по набору колонок: один запрос на группу. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.values()];
}

/** Значения ключа строки: ровно колонки PK, без null. */
function keyValues(meta: TableMeta, key: DbRow): (string | null)[] {
  const extra = Object.keys(key).filter((k) => !meta.primaryKey.includes(k));
  const missing = meta.primaryKey.filter((k) => key[k] === undefined || key[k] === null);
  if (extra.length > 0 || missing.length > 0) {
    throw new DbHttpError(400, `ключ строки — ровно колонки первичного ключа ${meta.primaryKey.join(', ')}${missing.length > 0 ? `; нет значения: ${missing.join(', ')}` : ''}${extra.length > 0 ? `; лишние: ${extra.join(', ')}` : ''}`);
  }
  return meta.primaryKey.map((k) => key[k] ?? null);
}

function insertStatements(meta: TableMeta, inserts: readonly DbRow[]): ChangeStatement[] {
  return groupBy(inserts, (r) => rowColumns(meta, r).map((c) => c.name).join('\u0000')).map((group) => {
    const cols = rowColumns(meta, group[0] ?? {});
    if (cols.length === 0) {
      // Строки целиком из DEFAULT: SELECT без колонок даёт n пустых строк одним запросом.
      return { kind: 'insert', expected: group.length, text: `INSERT INTO ${qualifiedName(meta)} SELECT FROM generate_series(1, ${group.length})`, params: [] };
    }
    const params = new Params();
    const values = group.map((r) => `(${cols.map((c) => params.add(r[c.name] ?? null, c.castType)).join(', ')})`);
    return {
      kind: 'insert',
      expected: group.length,
      text: `INSERT INTO ${qualifiedName(meta)} (${cols.map((c) => quoteIdent(c.name)).join(', ')}) VALUES ${values.join(', ')}`,
      params: params.list,
    };
  });
}

function updateStatements(meta: TableMeta, updates: DbChanges['updates']): ChangeStatement[] {
  const pk = meta.primaryKey.map((k) => columnOf(meta, k));
  return groupBy(updates, (u) => rowColumns(meta, u.set).map((c) => c.name).join('\u0000')).map((group) => {
    const cols = rowColumns(meta, group[0]?.set ?? {});
    if (cols.length === 0) {
      throw new DbHttpError(400, 'пустая правка: в set нет ни одной колонки');
    }
    const params = new Params();
    const values = group.map((u) => {
      const key = keyValues(meta, u.key);
      return `(${[...pk.map((c, i) => params.add(key[i] ?? null, c.castType)), ...cols.map((c) => params.add(u.set[c.name] ?? null, c.castType))].join(', ')})`;
    });
    const alias = [...pk.map((_, i) => `k${i}`), ...cols.map((_, i) => `s${i}`)].join(', ');
    return {
      kind: 'update',
      expected: group.length,
      text: `UPDATE ${qualifiedName(meta)} AS t SET ${cols.map((c, i) => `${quoteIdent(c.name)} = v.s${i}`).join(', ')} FROM (VALUES ${values.join(', ')}) AS v(${alias}) WHERE ${pk.map((c, i) => `t.${quoteIdent(c.name)} = v.k${i}`).join(' AND ')}`,
      params: params.list,
    };
  });
}

function deleteStatement(meta: TableMeta, deletes: readonly DbRow[]): ChangeStatement[] {
  if (deletes.length === 0) {
    return [];
  }
  const pk = meta.primaryKey.map((k) => columnOf(meta, k));
  const params = new Params();
  const tuples = deletes.map((key) => {
    const values = keyValues(meta, key);
    return `(${pk.map((c, i) => params.add(values[i] ?? null, c.castType)).join(', ')})`;
  });
  return [{
    kind: 'delete',
    expected: deletes.length,
    text: `DELETE FROM ${qualifiedName(meta)} WHERE (${pk.map((c) => quoteIdent(c.name)).join(', ')}) IN (${tuples.join(', ')})`,
    params: params.list,
  }];
}

/** Повторы ключей в одном списке — ошибка запроса: иначе не сверить число затронутых строк. */
function assertUniqueKeys(meta: TableMeta, keys: readonly DbRow[], what: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    const id = JSON.stringify(keyValues(meta, key));
    if (seen.has(id)) {
      throw new DbHttpError(400, `${what}: строка с ключом ${id} указана дважды`);
    }
    seen.add(id);
  }
}

/**
 * Запросы пакета правок по порядку: удаления, правки, вставки (так строку можно заменить
 * новой с тем же ключом). Один запрос на удаления и по одному на каждый набор колонок.
 *
 * @param meta - таблица
 * @param changes - пакет правок
 * @returns запросы с ожидаемым числом затронутых строк
 * @throws DbHttpError 400 — нет ключа, неизвестная колонка, неверный ключ, повтор ключа
 */
export function buildChangeStatements(meta: TableMeta, changes: DbChanges): ChangeStatement[] {
  if (meta.primaryKey.length === 0) {
    throw new DbHttpError(400, `у таблицы ${meta.name} нет первичного ключа — только чтение`);
  }
  assertUniqueKeys(meta, changes.deletes, 'удаление');
  assertUniqueKeys(meta, changes.updates.map((u) => u.key), 'правка');
  return [...deleteStatement(meta, changes.deletes), ...updateStatements(meta, changes.updates), ...insertStatements(meta, changes.inserts)];
}
