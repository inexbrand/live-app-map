/**
 * Работа с живой БД: ленивый пул, проверка связи, страница строк, пакет правок одной транзакцией.
 */
import postgres, { type Sql } from 'postgres';
import type { ChangesResult, DbChanges, DbRow, RowsPage, RowsQuery } from './contract';
import { introspectTable } from './db-introspect';
import { buildChangeStatements, buildPageQueries, DbHttpError } from './db-sql';

/** Соединений в пуле: dev-инструмент одного человека. */
export const DB_POOL_MAX = 3;

let pool: { readonly url: string; readonly sql: Sql } | null = null;

/**
 * Пул для адреса: создаётся при первом запросе; адрес сменился (правка config/env) — старый закрывается.
 *
 * @param url - адрес postgres://
 */
export function dbPool(url: string): Sql {
  if (pool !== null && pool.url === url) {
    return pool.sql;
  }
  if (pool !== null) {
    void pool.sql.end({ timeout: 1 });
  }
  const sql = postgres(url, { max: DB_POOL_MAX, idle_timeout: 30, connect_timeout: 5, onnotice: () => undefined });
  pool = { url, sql };
  return sql;
}

/** Закрывает пул (тесты, остановка сервера). */
export async function closeDbPool(): Promise<void> {
  const current = pool;
  pool = null;
  if (current !== null) {
    await current.sql.end({ timeout: 1 });
  }
}

/**
 * Проверяет связь: имя текущей базы.
 *
 * @param sql - пул
 */
export async function pingDb(sql: Sql): Promise<string> {
  const rows = await sql.unsafe('SELECT current_database()::text AS db');
  return String(rows[0]?.['db'] ?? '');
}

/** Строка ответа как DbRow: значения — текст или null. */
function toDbRow(r: Readonly<Record<string, unknown>>): DbRow {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]));
}

/**
 * Страница строк: колонки, ключ, строки текстом и общее число с учётом фильтра.
 *
 * @param sql - пул
 * @param q - запрос страницы
 */
export async function readRowsPage(sql: Sql, q: RowsQuery): Promise<RowsPage> {
  const meta = await introspectTable(sql, q.table);
  const { rows, count } = buildPageQueries(meta, q);
  const [list, total] = await Promise.all([sql.unsafe(rows.text, [...rows.params]), sql.unsafe(count.text, [...count.params])]);
  return {
    table: meta.name,
    columns: meta.columns.map(({ castType: _cast, ...c }) => c),
    primaryKey: [...meta.primaryKey],
    rows: list.map(toDbRow),
    total: Number(total[0]?.['total'] ?? 0),
    page: q.page,
    size: q.size,
  };
}

/**
 * Применяет пакет одной транзакцией. Число затронутых строк сверяется с ожиданием:
 * не совпало (строку изменили или удалили параллельно) — откат и 409.
 *
 * @param sql - пул
 * @param changes - пакет правок
 * @throws DbHttpError 400/404/409; ошибка Postgres — как есть (откат уже сделан)
 */
export async function applyChanges(sql: Sql, changes: DbChanges): Promise<ChangesResult> {
  const meta = await introspectTable(sql, changes.table);
  const statements = buildChangeStatements(meta, changes);
  const result = { inserted: 0, updated: 0, deleted: 0 };
  if (statements.length === 0) {
    return result;
  }
  await sql.begin(async (tx) => {
    // Запросы пакета идут по очереди в одной транзакции: их число — по виду правки и набору колонок, не по строкам.
    for (const st of statements) {
      const res = await tx.unsafe(st.text, [...st.params]);
      if (res.count !== st.expected) {
        throw new DbHttpError(409, `${verb(st.kind)}: ожидалось строк ${st.expected}, затронуто ${res.count} — строку изменили или удалили параллельно, обновите таблицу`);
      }
      result[st.kind === 'insert' ? 'inserted' : st.kind === 'update' ? 'updated' : 'deleted'] += res.count;
    }
  });
  return result;
}

function verb(kind: 'insert' | 'update' | 'delete'): string {
  return kind === 'insert' ? 'вставка' : kind === 'update' ? 'правка' : 'удаление';
}

/**
 * HTTP-код и текст для пойманной ошибки: свои — как есть, Postgres — 409 для конфликтов
 * (уникальность, сериализация), 400 для прочих; нет связи — 503.
 *
 * @param err - что поймали
 */
export function dbErrorResponse(err: unknown): { readonly status: number; readonly error: string } {
  if (err instanceof DbHttpError) {
    return { status: err.status, error: err.message };
  }
  if (err instanceof postgres.PostgresError) {
    const conflict = err.code === '23505' || err.code === '40001' || err.code === '40P01';
    return { status: conflict ? 409 : 400, error: `Postgres: ${err.message}${err.detail === undefined ? '' : ` (${err.detail})`}` };
  }
  return { status: 503, error: `нет связи с БД: ${err instanceof Error ? err.message : String(err)}` };
}
