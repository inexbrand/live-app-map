/**
 * Колонки Drizzle: тип, флаги цепочки (`.notNull()`, `.references()` …), enum,
 * составные ключи третьего аргумента `pgTable`.
 */
import ts from 'typescript';
import type { DbColumn } from '@live-app-map/schema';
import { commentsOf } from './comments';
import type { SourceContext } from './source-context';

/** Имя фабрики таблицы: `pgTable` или `table` из `schema.table`. */
export function factoryName(call: ts.CallExpression): string | undefined {
  const c = call.expression;
  if (ts.isIdentifier(c)) {
    return c.text;
  }
  if (ts.isPropertyAccessExpression(c)) {
    return c.name.text;
  }
  return undefined;
}

/** Снимает `as const`, `satisfies` и скобки. */
function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression;
  }
  return cur;
}

/**
 * Строки массива: литерал на месте или константа, объявленная массивом строк.
 *
 * @param ctx - контекст (checker для перехода к объявлению)
 * @param e - выражение `enum`
 * @returns значения или undefined, если не вычислить
 */
function stringArray(ctx: SourceContext, e: ts.Expression): string[] | undefined {
  let cur = unwrap(e);
  if (ts.isIdentifier(cur)) {
    const sym = ctx.checker.getSymbolAtLocation(cur);
    const target = sym !== undefined && (sym.flags & ts.SymbolFlags.Alias) !== 0 ? ctx.checker.getAliasedSymbol(sym) : sym;
    const decl = target?.valueDeclaration;
    if (decl === undefined || !ts.isVariableDeclaration(decl) || decl.initializer === undefined) {
      return undefined;
    }
    cur = unwrap(decl.initializer);
  }
  if (!ts.isArrayLiteralExpression(cur)) {
    return undefined;
  }
  const out = cur.elements.map((el) => (ts.isStringLiteralLike(el) ? el.text : undefined));
  return out.every((x): x is string => x !== undefined) ? out : undefined;
}

/** Ссылка `() => users.id` → таблица и колонка. */
function referenceTarget(e: ts.Expression | undefined): { table: string; column: string } | undefined {
  if (e === undefined) {
    return undefined;
  }
  const body = ts.isArrowFunction(e) && !ts.isBlock(e.body) ? unwrap(e.body) : unwrap(e);
  if (ts.isPropertyAccessExpression(body) && ts.isIdentifier(body.expression)) {
    return { table: body.expression.text, column: body.name.text };
  }
  return undefined;
}

/** Значение свойства объекта-литерала по имени. */
function propOf(obj: ts.Expression | undefined, name: string): ts.Expression | undefined {
  if (obj === undefined || !ts.isObjectLiteralExpression(obj)) {
    return undefined;
  }
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === name) {
      return p.initializer;
    }
  }
  return undefined;
}

/** Колонка без имени: то, что набирают методы цепочки. */
export type ColumnFlags = Omit<DbColumn, 'name' | 'sqlName' | 'type' | 'doc'>;

/**
 * Флаг метода цепочки: `.notNull()`, `.primaryKey()`, `.unique()`, `.default(x)`, `.references(...)`.
 *
 * @param method - имя метода
 * @param args - аргументы вызова
 * @param sf - файл (текст default)
 * @returns поля колонки от этого метода
 */
function chainFlags(method: string, args: ts.NodeArray<ts.Expression>, sf: ts.SourceFile): ColumnFlags {
  switch (method) {
    case 'notNull':
      return { notNull: true };
    case 'primaryKey':
      return { primaryKey: true, notNull: true };
    case 'unique':
      return { unique: true };
    case 'defaultNow':
      return { default: 'now()' };
    case 'defaultRandom':
      return { default: 'gen_random_uuid()' };
    case 'default': {
      const v = args[0];
      return v === undefined ? {} : { default: v.getText(sf).replace(/^sql`(.*)`$/s, '$1') };
    }
    case 'references': {
      const target = referenceTarget(args[0]);
      const onDelete = propOf(args[1], 'onDelete');
      return target === undefined
        ? {}
        : { references: { ...target, ...(onDelete !== undefined && ts.isStringLiteralLike(onDelete) ? { onDelete: onDelete.text } : {}) } };
    }
    default:
      return {};
  }
}

/**
 * Колонка: идём по цепочке `uuid('id').primaryKey().notNull()` до корневого вызова,
 * собирая флаги методов.
 *
 * @param ctx - контекст
 * @param name - имя свойства
 * @param init - выражение колонки
 * @param sf - файл
 * @returns колонка или undefined
 */
export function columnOf(ctx: SourceContext, name: string, init: ts.Expression, sf: ts.SourceFile): DbColumn | undefined {
  let cur: ts.Expression = init;
  let flags: ColumnFlags = {};
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    const inner = cur.expression.expression;
    if (!ts.isCallExpression(inner)) {
      break;
    }
    // Внутренние методы цепочки применяются раньше: внешний не перетирает их флаги.
    flags = { ...chainFlags(cur.expression.name.text, cur.arguments, sf), ...flags };
    cur = inner;
  }
  if (!ts.isCallExpression(cur)) {
    return undefined;
  }
  const type = factoryName(cur);
  if (type === undefined) {
    return undefined;
  }
  const [first, second] = cur.arguments;
  const sqlName = first !== undefined && ts.isStringLiteral(first) ? first.text : undefined;
  const options = first !== undefined && ts.isObjectLiteralExpression(first) ? first : second;
  const enumExpr = propOf(options, 'enum');
  const enumValues = enumExpr === undefined ? undefined : stringArray(ctx, enumExpr);
  return {
    name,
    ...(sqlName === undefined || sqlName === name ? {} : { sqlName }),
    type,
    ...orderFlags(flags),
    ...(enumValues === undefined ? {} : { enumValues }),
  };
}

/** Флаги в постоянном порядке ключей — стабильный JSON карты. */
export function orderFlags(f: ColumnFlags): ColumnFlags {
  return {
    ...(f.primaryKey === true ? { primaryKey: true } : {}),
    ...(f.notNull === true ? { notNull: true } : {}),
    ...(f.unique === true ? { unique: true } : {}),
    ...(f.default === undefined ? {} : { default: f.default }),
    ...(f.references === undefined ? {} : { references: f.references }),
  };
}

/**
 * Составные ключи из третьего аргумента: `primaryKey({ columns })`, `foreignKey({ columns, foreignColumns })`.
 *
 * @param arg - третий аргумент pgTable
 * @returns имя колонки → добавочные флаги
 */
export function tableLevelKeys(arg: ts.Expression | undefined): Map<string, ColumnFlags> {
  const out = new Map<string, ColumnFlags>();
  if (arg === undefined || !ts.isArrowFunction(arg)) {
    return out;
  }
  const add = (col: string, f: ColumnFlags): void => {
    out.set(col, { ...(out.get(col) ?? {}), ...f });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const name = factoryName(n);
      const opts = n.arguments[0];
      const cols = propOf(opts, 'columns');
      const names = cols !== undefined && ts.isArrayLiteralExpression(cols)
        ? cols.elements.map((e) => (ts.isPropertyAccessExpression(e) ? e.name.text : undefined))
        : [];
      if (name === 'primaryKey') {
        names.forEach((c) => c !== undefined && add(c, { primaryKey: true, notNull: true }));
      }
      if (name === 'foreignKey') {
        const foreign = propOf(opts, 'foreignColumns');
        const targets = foreign !== undefined && ts.isArrayLiteralExpression(foreign) ? foreign.elements.map((e) => referenceTarget(e)) : [];
        names.forEach((c, i) => {
          const target = targets[i];
          if (c !== undefined && target !== undefined) {
            add(c, { references: target });
          }
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(arg.body);
  return out;
}

/** Описание колонки: JSDoc, иначе обычные комментарии. */
export function columnDoc(prop: ts.Node, sf: ts.SourceFile): string | undefined {
  const c = commentsOf(prop, sf);
  return c.doc ?? (c.comments === undefined ? undefined : c.comments.join('\n'));
}

