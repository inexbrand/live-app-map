/**
 * Интроспекция таблицы через pg_catalog: колонки, enum-значения, первичный ключ — одним запросом.
 */
import type { Sql } from 'postgres';
import { DbHttpError, type ColumnMeta, type TableMeta } from './db-sql';

/**
 * Колонки таблицы с этим именем во всех несистемных схемах. Тип — udt_name (pg_type.typname),
 * приведение — базовый тип без модификатора, hasDefault учитывает DEFAULT, identity и generated.
 */
export const INTROSPECT_SQL = `
SELECT n.nspname::text AS schema_name,
       a.attname::text AS column_name,
       t.typname::text AS udt_name,
       format_type(a.atttypid, NULL) AS cast_type,
       NOT a.attnotnull AS nullable,
       (a.atthasdef OR a.attidentity <> '' OR a.attgenerated <> '') AS has_default,
       (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid) AS enum_values,
       array_position(i.indkey::int2[], a.attnum) AS pk_position
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
WHERE c.relname = $1
  AND c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\\_toast%'
  AND n.nspname NOT LIKE 'pg\\_temp%'
ORDER BY n.nspname, a.attnum`;

/** Строка ответа {@link INTROSPECT_SQL}. */
export type IntrospectRow = {
  readonly schema_name: string;
  readonly column_name: string;
  readonly udt_name: string;
  readonly cast_type: string;
  readonly nullable: boolean;
  readonly has_default: boolean;
  readonly enum_values: readonly string[] | null;
  readonly pk_position: number | null;
};

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') {
    throw new Error(`интроспекция: поле ${field} не строка`);
  }
  return v;
}

/**
 * Строка драйвера как {@link IntrospectRow} (проверка типов полей).
 *
 * @param r - строка ответа postgres.js
 */
export function toIntrospectRow(r: Readonly<Record<string, unknown>>): IntrospectRow {
  const enums = r['enum_values'];
  const pk = r['pk_position'];
  return {
    schema_name: str(r['schema_name'], 'schema_name'),
    column_name: str(r['column_name'], 'column_name'),
    udt_name: str(r['udt_name'], 'udt_name'),
    cast_type: str(r['cast_type'], 'cast_type'),
    nullable: r['nullable'] === true,
    has_default: r['has_default'] === true,
    enum_values: Array.isArray(enums) ? enums.map(String) : null,
    pk_position: typeof pk === 'number' ? pk : null,
  };
}

/**
 * Таблица из строк интроспекции.
 *
 * @param table - имя таблицы из запроса
 * @param rows - строки {@link INTROSPECT_SQL}
 * @returns таблица
 * @throws DbHttpError 404 — таблицы нет; 400 — она в нескольких схемах
 */
export function tableMetaFromRows(table: string, rows: readonly IntrospectRow[]): TableMeta {
  const schemas = [...new Set(rows.map((r) => r.schema_name))];
  if (schemas.length === 0) {
    throw new DbHttpError(404, `таблицы ${table} нет в базе — проверьте имя или примените миграции`);
  }
  if (schemas.length > 1) {
    throw new DbHttpError(400, `таблица ${table} есть в нескольких схемах: ${schemas.join(', ')} — какую показывать, не понять`);
  }
  const columns = rows.map((r): ColumnMeta => ({
    name: r.column_name,
    type: r.udt_name,
    nullable: r.nullable,
    hasDefault: r.has_default,
    castType: r.cast_type,
    ...(r.enum_values === null ? {} : { enumValues: [...r.enum_values] }),
  }));
  const primaryKey = rows
    .filter((r) => r.pk_position !== null)
    .sort((a, b) => (a.pk_position ?? 0) - (b.pk_position ?? 0))
    .map((r) => r.column_name);
  return { schema: schemas[0] ?? '', name: table, columns, primaryKey };
}

/**
 * Читает таблицу из базы.
 *
 * @param sql - пул postgres.js
 * @param table - имя таблицы
 */
export async function introspectTable(sql: Sql, table: string): Promise<TableMeta> {
  const rows = await sql.unsafe(INTROSPECT_SQL, [table]);
  return tableMetaFromRows(table, rows.map(toIntrospectRow));
}
