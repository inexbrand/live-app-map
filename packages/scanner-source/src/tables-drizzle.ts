/**
 * Таблицы Drizzle: `pgTable('name', { col: type('sql') })`, mysqlTable, sqliteTable, schema.table.
 */
import ts from 'typescript';
import type { DbColumn, DbTable } from '@live-app-map/schema';
import { commentsOf } from './comments';
import { columnDoc, columnOf, factoryName, orderFlags, tableLevelKeys, type ColumnFlags } from './drizzle-columns';
import { locationOf, type SourceContext } from './source-context';

const TABLE_FACTORIES: ReadonlySet<string> = new Set(['pgTable', 'mysqlTable', 'sqliteTable', 'table']);

/** Таблица без id и serviceId. */
export type FoundTable = Omit<DbTable, 'id' | 'serviceId'>;

/** Объект колонок: второй аргумент-объект или стрелка, возвращающая объект. */
function columnsObject(arg: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  const body = arg !== undefined && ts.isArrowFunction(arg) ? arrowResult(arg) : arg;
  return body !== undefined && ts.isObjectLiteralExpression(body) ? body : undefined;
}

/** Выражение стрелки без скобок: `() => ({ … })`. */
function arrowResult(arg: ts.ArrowFunction): ts.Node {
  return ts.isParenthesizedExpression(arg.body) ? arg.body.expression : arg.body;
}

/**
 * Таблицы Drizzle, объявленные в файле.
 *
 * @param ctx - контекст
 * @param sf - файл
 * @returns таблицы
 */
export function collectDrizzleTables(ctx: SourceContext, sf: ts.SourceFile): FoundTable[] {
  const out = sf.statements.filter(ts.isVariableStatement).flatMap((stmt) =>
    stmt.declarationList.declarations.flatMap((decl) => tableOf(ctx, stmt, decl, sf) ?? []),
  );
  return withFileHeaderDoc(out, sf);
}

/** `export const users = pgTable('users', { … })` → таблица; не таблица — undefined. */
function tableOf(ctx: SourceContext, stmt: ts.VariableStatement, decl: ts.VariableDeclaration, sf: ts.SourceFile): FoundTable | undefined {
  const found = tableCall(decl);
  const cols = found === undefined ? undefined : columnsObject(found.init.arguments[1]);
  if (found === undefined || cols === undefined || !ts.isIdentifier(decl.name)) {
    return undefined;
  }
  const { init, table } = found;
  return {
    orm: 'drizzle',
    name: table,
    exportName: decl.name.text,
    location: locationOf(ctx, decl.name),
    columns: tableColumns(ctx, cols, tableLevelKeys(init.arguments[2]), sf),
    ...commentsOf(stmt, sf),
  };
}

/** Инициализатор-вызов фабрики таблицы и имя таблицы. */
function tableCall(decl: ts.VariableDeclaration): { readonly init: ts.CallExpression; readonly table: string } | undefined {
  const init = decl.initializer;
  const table = init !== undefined && ts.isCallExpression(init) ? tableName(init) : undefined;
  return table === undefined || init === undefined || !ts.isCallExpression(init) ? undefined : { init, table };
}

/** Имя таблицы вызова фабрики `pgTable('users', …)`, `schema.table(…)`; не фабрика — undefined. */
function tableName(call: ts.CallExpression): string | undefined {
  const factory = factoryName(call);
  const arg = call.arguments[0];
  return factory !== undefined && TABLE_FACTORIES.has(factory) && arg !== undefined && ts.isStringLiteral(arg) ? arg.text : undefined;
}

/** Колонки объекта: флаги цепочки плюс составные ключи таблицы, enum и описание. */
function tableColumns(ctx: SourceContext, cols: ts.ObjectLiteralExpression, keys: ReadonlyMap<string, ColumnFlags>, sf: ts.SourceFile): DbColumn[] {
  return cols.properties.filter(ts.isPropertyAssignment).flatMap((prop) => {
    const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
    const col = columnOf(ctx, name, prop.initializer, sf);
    if (col === undefined) {
      return [];
    }
    const { enumValues, ...rest } = col;
    const doc = columnDoc(prop, sf);
    return [{
      ...rest,
      ...orderFlags({ ...rest, ...(keys.get(name) ?? {}) }),
      ...(enumValues === undefined ? {} : { enumValues }),
      ...(doc === undefined ? {} : { doc }),
    }];
  });
}

/**
 * Единственная таблица файла без своего JSDoc получает шапку файла —
 * так описывают таблицы, когда файл = одна таблица.
 *
 * @param tables - таблицы файла
 * @param sf - файл
 * @returns таблицы с описанием
 */
function withFileHeaderDoc(tables: FoundTable[], sf: ts.SourceFile): FoundTable[] {
  const only = tables[0];
  const first = sf.statements[0];
  if (tables.length !== 1 || only === undefined || only.doc !== undefined || first === undefined) {
    return tables;
  }
  const header = commentsOf(first, sf).doc;
  return header === undefined ? tables : [{ ...only, doc: header }];
}

/**
 * Быстрая проверка без AST: в файле есть фабрика таблиц Drizzle.
 *
 * @param text - текст файла
 * @returns true, если стоит разбирать
 */
export function mayDeclareDrizzleTables(text: string): boolean {
  return /\b(pgTable|mysqlTable|sqliteTable|\.table)\s*\(/.test(text);
}
