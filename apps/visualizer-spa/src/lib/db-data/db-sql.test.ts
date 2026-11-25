/**
 * Сборка SQL по запросу: экранирование, страница, пакет правок и отказы до похода в БД.
 */
import { describe, expect, test } from 'bun:test';
import { buildChangeStatements, buildPageQueries, DbHttpError, quoteIdent, type ColumnMeta, type TableMeta } from './db-sql';

function col(name: string, castType: string): ColumnMeta {
  return { name, type: castType, nullable: true, hasDefault: false, castType };
}

const items: TableMeta = {
  schema: 'public',
  name: 'items',
  columns: [col('id', 'integer'), col('name', 'text'), col('we"ird', 'jsonb')],
  primaryKey: ['id'],
};

const noPk: TableMeta = { ...items, name: 'log', primaryKey: [] };

function httpError(fn: () => unknown): { readonly status: number; readonly message: string } | null {
  try {
    fn();
    return null;
  } catch (err: unknown) {
    return err instanceof DbHttpError ? { status: err.status, message: err.message } : null;
  }
}

describe('quoteIdent', () => {
  test('кавычки удваиваются, имя целиком в кавычках', () => {
    expect([quoteIdent('users'), quoteIdent('a"b'), quoteIdent('"; DROP TABLE x; --')]).toEqual(['"users"', '"a""b"', '"""; DROP TABLE x; --"']);
  });
});

describe('buildPageQueries', () => {
  test('все колонки текстом, фильтр параметром, сортировка с добивкой ключом, LIMIT/OFFSET', () => {
    const q = buildPageQueries(items, { table: 'items', page: 2, size: 50, sort: 'name', dir: 'desc', filterColumn: 'we"ird', filterValue: "x' OR 1=1" });
    expect(q.rows).toEqual({
      text: 'SELECT t."id"::text AS "id", t."name"::text AS "name", t."we""ird"::text AS "we""ird" FROM "public"."items" AS t WHERE t."we""ird"::text = $1 ORDER BY t."name" DESC, t."id" ASC LIMIT 50 OFFSET 100',
      params: ["x' OR 1=1"],
    });
    expect(q.count).toEqual({ text: 'SELECT count(*)::text AS total FROM "public"."items" AS t WHERE t."we""ird"::text = $1', params: ["x' OR 1=1"] });
  });

  test('без сортировки — по ключу; без ключа — без ORDER BY', () => {
    expect(buildPageQueries(items, { table: 'items', page: 0, size: 5 }).rows.text).toEndWith('FROM "public"."items" AS t ORDER BY t."id" ASC LIMIT 5 OFFSET 0');
    expect(buildPageQueries(noPk, { table: 'log', page: 0, size: 5 }).rows.text).toEndWith('FROM "public"."log" AS t LIMIT 5 OFFSET 0');
  });

  test('неизвестная колонка сортировки или фильтра — 400; фильтр без пары — 400', () => {
    expect(httpError(() => buildPageQueries(items, { table: 'items', page: 0, size: 5, sort: 'nope' }))).toEqual({ status: 400, message: 'нет колонки nope в таблице items' });
    expect(httpError(() => buildPageQueries(items, { table: 'items', page: 0, size: 5, filterColumn: 'id' }))).toEqual({ status: 400, message: 'фильтр задаётся парой filterColumn и filterValue' });
  });
});

describe('buildChangeStatements', () => {
  test('удаления одним запросом, правки и вставки — по запросу на набор колонок, значения с приведением типа', () => {
    const st = buildChangeStatements(items, {
      table: 'items',
      deletes: [{ id: '1' }, { id: '2' }],
      updates: [{ key: { id: '3' }, set: { name: 'a' } }, { key: { id: '4' }, set: { name: null } }, { key: { id: '5' }, set: { name: 'b', id: '50' } }],
      inserts: [{ name: 'n1' }, { name: 'n2' }, {}],
    });
    expect(st).toEqual([
      { kind: 'delete', expected: 2, text: 'DELETE FROM "public"."items" WHERE ("id") IN (($1::text::integer), ($2::text::integer))', params: ['1', '2'] },
      {
        kind: 'update',
        expected: 2,
        text: 'UPDATE "public"."items" AS t SET "name" = v.s0 FROM (VALUES ($1::text::integer, $2::text::text), ($3::text::integer, $4::text::text)) AS v(k0, s0) WHERE t."id" = v.k0',
        params: ['3', 'a', '4', null],
      },
      {
        kind: 'update',
        expected: 1,
        text: 'UPDATE "public"."items" AS t SET "id" = v.s0, "name" = v.s1 FROM (VALUES ($1::text::integer, $2::text::integer, $3::text::text)) AS v(k0, s0, s1) WHERE t."id" = v.k0',
        params: ['5', '50', 'b'],
      },
      { kind: 'insert', expected: 2, text: 'INSERT INTO "public"."items" ("name") VALUES ($1::text::text), ($2::text::text)', params: ['n1', 'n2'] },
      { kind: 'insert', expected: 1, text: 'INSERT INTO "public"."items" SELECT FROM generate_series(1, 1)', params: [] },
    ]);
  });

  test('отказы: нет ключа у таблицы, неизвестная колонка, неверный ключ, повтор, пустая правка', () => {
    const empty = { table: 'items', inserts: [], updates: [], deletes: [] };
    expect(httpError(() => buildChangeStatements(noPk, empty))).toEqual({ status: 400, message: 'у таблицы log нет первичного ключа — только чтение' });
    expect(httpError(() => buildChangeStatements(items, { ...empty, inserts: [{ nope: '1' }] }))).toEqual({ status: 400, message: 'нет колонки nope в таблице items' });
    expect(httpError(() => buildChangeStatements(items, { ...empty, deletes: [{ name: 'x' }] }))).toEqual({ status: 400, message: 'ключ строки — ровно колонки первичного ключа id; нет значения: id; лишние: name' });
    expect(httpError(() => buildChangeStatements(items, { ...empty, deletes: [{ id: '1' }, { id: '1' }] }))).toEqual({ status: 400, message: 'удаление: строка с ключом ["1"] указана дважды' });
    expect(httpError(() => buildChangeStatements(items, { ...empty, updates: [{ key: { id: '1' }, set: {} }] }))).toEqual({ status: 400, message: 'пустая правка: в set нет ни одной колонки' });
  });
});
