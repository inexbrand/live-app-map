/**
 * Таблицы Drizzle: `pgTable('name', { col: type('sql') })`, mysqlTable, sqliteTable, schema.table.
 */
import ts from 'typescript';
import type { DbColumn, DbTable } from '@live-app-map/schema';
import { commentsOf } from './comments';
import { columnDoc, columnOf, factoryName, orderFlags, tableLevelKeys } from './drizzle-columns';
import { locationOf, type SourceContext } from './source-context';

const TABLE_FACTORIES: ReadonlySet<string> = new Set(['pgTable', 'mysqlTable', 'sqliteTable', 'table']);

/** Таблица без id и serviceId. */
export type FoundTable = Omit<DbTable, 'id' | 'serviceId'>;

/** Объект колонок: второй аргумент-объект или стрелка, возвращающая объект. */
function columnsObject(arg: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  if (arg === undefined) {
    return undefined;
  }
  if (ts.isObjectLiteralExpression(arg)) {
    return arg;
  }
  if (ts.isArrowFunction(arg)) {
    const body = ts.isParenthesizedExpression(arg.body) ? arg.body.expression : arg.body;
    return ts.isObjectLiteralExpression(body) ? body : undefined;
  }
  return undefined;
}

/**
 * Таблицы Drizzle, объявленные в файле.
 *
 * @param ctx - контекст
 * @param sf - файл
 * @returns таблицы
 */
export function collectDrizzleTables(ctx: SourceContext, sf: ts.SourceFile): FoundTable[] {
  const out: FoundTable[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) {
      continue;
    }
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      if (!ts.isIdentifier(decl.name) || init === undefined || !ts.isCallExpression(init)) {
        continue;
      }
      const factory = factoryName(init);
      const tableArg = init.arguments[0];
      if (factory === undefined || !TABLE_FACTORIES.has(factory) || tableArg === undefined || !ts.isStringLiteral(tableArg)) {
        continue;
      }
      const cols = columnsObject(init.arguments[1]);
      if (cols === undefined) {
        continue;
      }
      const keys = tableLevelKeys(init.arguments[2]);
      const columns: DbColumn[] = [];
      for (const prop of cols.properties) {
        if (ts.isPropertyAssignment(prop)) {
          const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
          const col = columnOf(ctx, name, prop.initializer, sf);
          if (col !== undefined) {
            const { enumValues, ...rest } = col;
            const doc = columnDoc(prop, sf);
            columns.push({
              ...rest,
              ...orderFlags({ ...rest, ...(keys.get(name) ?? {}) }),
              ...(enumValues === undefined ? {} : { enumValues }),
              ...(doc === undefined ? {} : { doc }),
            });
          }
        }
      }
      out.push({
        orm: 'drizzle',
        name: tableArg.text,
        exportName: decl.name.text,
        location: locationOf(ctx, decl.name),
        columns,
        ...commentsOf(stmt, sf),
      });
    }
  }
  return withFileHeaderDoc(out, sf);
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
