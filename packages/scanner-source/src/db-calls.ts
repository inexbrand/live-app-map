/**
 * Поиск обращений к БД (Drizzle, Prisma) в теле функции и в функциях проекта,
 * которые она вызывает.
 */
import ts from 'typescript';
import type { DbCall, DbOperation } from '@live-app-map/schema';
import { ownerInterface } from './implementations';
import { isProjectNode, locationOf, resolvedSymbol, type SourceContext } from './source-context';

/** Глубина обхода вызываемых функций (обработчик → сервис → репозиторий → …). */
const MAX_DEPTH = 4;

/** Методы массива, колбэк которых выполняется на каждый элемент. */
const LOOP_METHODS: ReadonlySet<string> = new Set(['map', 'forEach', 'flatMap', 'filter', 'reduce', 'some', 'every', 'find']);

/**
 * Выполняется ли дочерний узел многократно относительно родителя:
 * тело for/while/do, тело for…of/for…in (но не итерируемое выражение),
 * колбэк `.map/.forEach/…`.
 *
 * @param parent - родитель
 * @param child - дочерний узел
 * @returns true, если child внутри цикла
 */
function repeats(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) {
    return child === parent.statement;
  }
  if (ts.isForStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) {
    return child !== (ts.isForStatement(parent) ? parent.initializer : undefined);
  }
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    LOOP_METHODS.has(parent.expression.name.text) &&
    child !== parent.expression &&
    (ts.isArrowFunction(child) || ts.isFunctionExpression(child))
  );
}

/** Получатель, похожий на клиент БД или транзакцию. */
const DB_RECEIVER = /(^|\.)(db|tx|trx|database|client|prisma)$/i;

const DRIZZLE_WRITE: ReadonlyMap<string, DbOperation> = new Map<string, DbOperation>([
  ['insert', 'insert'],
  ['update', 'update'],
  ['delete', 'delete'],
]);

const PRISMA_OPS: ReadonlyMap<string, DbOperation> = new Map<string, DbOperation>([
  ['findMany', 'select'],
  ['findFirst', 'select'],
  ['findFirstOrThrow', 'select'],
  ['findUnique', 'select'],
  ['findUniqueOrThrow', 'select'],
  ['aggregate', 'select'],
  ['groupBy', 'select'],
  ['create', 'insert'],
  ['createMany', 'insert'],
  ['createManyAndReturn', 'insert'],
  ['update', 'update'],
  ['updateMany', 'update'],
  ['upsert', 'upsert'],
  ['delete', 'delete'],
  ['deleteMany', 'delete'],
  ['count', 'count'],
]);

/**
 * Имя таблицы из аргумента Drizzle: `users` или `schema.users`.
 *
 * @param arg - выражение-аргумент
 * @returns имя или undefined
 */
function tableName(arg: ts.Expression | undefined): string | undefined {
  if (arg === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(arg)) {
    return arg.text;
  }
  if (ts.isPropertyAccessExpression(arg)) {
    return arg.name.text;
  }
  return undefined;
}

/**
 * Получатель цепочки начинается с вызова `select*()`: `db.select().from(t)`.
 *
 * @param receiver - выражение слева от `.from`
 * @returns true для select-цепочки
 */
function isSelectChain(receiver: ts.Expression): boolean {
  return (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text.startsWith('select')
  );
}

/**
 * Вызов Drizzle: `.from(t)` после select, `db.insert/update/delete(t)`,
 * `db.query.t.findMany()`.
 *
 * @param ctx - контекст
 * @param call - вызов
 * @returns операция и таблица или undefined
 */
function drizzleCall(
  ctx: SourceContext,
  call: ts.CallExpression,
): { operation: DbOperation; table: string } | undefined {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const method = callee.name.text;
  const receiver = callee.expression;
  const table = tableName(call.arguments[0]);
  if (method === 'from' && table !== undefined && isSelectChain(receiver)) {
    return { operation: 'select', table };
  }
  const write = DRIZZLE_WRITE.get(method);
  if (write !== undefined && table !== undefined && call.arguments.length === 1) {
    const known = ctx.drizzleTables.has(table);
    if (known || DB_RECEIVER.test(receiver.getText())) {
      return { operation: write, table };
    }
  }
  // db.query.<table>.findMany / findFirst
  if (
    (method === 'findMany' || method === 'findFirst') &&
    ts.isPropertyAccessExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === 'query'
  ) {
    return { operation: 'select', table: receiver.name.text };
  }
  return undefined;
}

/**
 * Вызов Prisma: `prisma.order.create()`.
 *
 * @param ctx - контекст
 * @param call - вызов
 * @returns операция и модель или undefined
 */
function prismaCall(
  ctx: SourceContext,
  call: ts.CallExpression,
): { operation: DbOperation; table: string } | undefined {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const operation = PRISMA_OPS.get(callee.name.text);
  const modelAccess = callee.expression;
  if (operation === undefined || !ts.isPropertyAccessExpression(modelAccess)) {
    return undefined;
  }
  const accessor = modelAccess.name.text;
  const model = ctx.prismaModels.get(accessor.toLowerCase());
  const client = modelAccess.expression.getText();
  if (model !== undefined && DB_RECEIVER.test(client)) {
    return { operation, table: model };
  }
  if (ctx.prismaModels.size === 0 && /prisma/i.test(client)) {
    return { operation, table: accessor };
  }
  return undefined;
}

/** Тело вызываемой функции и имя для `via`. */
export type Callee = { readonly name: string; readonly node: ts.Node };

/**
 * Тела функций проекта, на которые ссылается вызов: сама функция, либо
 * реализации метода интерфейса (`repo.getById()` → методы фабрик и классов).
 *
 * @param ctx - контекст
 * @param call - вызов
 * @returns тела (пусто, если вызов ведёт вне проекта)
 */
export function calledFunctions(ctx: SourceContext, call: ts.CallExpression): Callee[] {
  const callee = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name
    : call.expression;
  if (!ts.isIdentifier(callee)) {
    return [];
  }
  const sym = resolvedSymbol(ctx.checker, callee);
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (decl === undefined || !isProjectNode(ctx, decl)) {
    return [];
  }
  if ((ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) && decl.body !== undefined) {
    return [{ name: callee.text, node: decl.body }];
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined) {
    const init = decl.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      return [{ name: callee.text, node: init.body }];
    }
  }
  const iface = ownerInterface(decl);
  const impls = iface === undefined ? undefined : ctx.implementations.get(iface)?.get(callee.text);
  return (impls ?? []).map((node) => ({ name: `${iface}.${callee.text}`, node }));
}

/**
 * Все обращения к БД внутри узла; вызовы функций проекта обходятся до глубины 3,
 * найденное там помечается `via` — именем функции, вызванной из узла.
 *
 * @param ctx - контекст
 * @param root - тело обработчика или функции
 * @returns вызовы БД без повторов
 */
export function collectDbCalls(ctx: SourceContext, root: ts.Node): DbCall[] {
  const out: DbCall[] = [];
  const seen = new Set<string>();
  // Тело, обойдённое вне цикла и в цикле, — разные случаи: в цикле это N+1.
  const visited = { inLoop: new Set<ts.Node>(), once: new Set<ts.Node>([root]) };

  const walk = (node: ts.Node, via: string | undefined, depth: number, inLoop: boolean): void => {
    if (ts.isCallExpression(node)) {
      const drizzle = drizzleCall(ctx, node);
      const prisma = drizzle === undefined ? prismaCall(ctx, node) : undefined;
      const found = drizzle ?? prisma;
      if (found !== undefined) {
        const call: DbCall = {
          orm: drizzle === undefined ? 'prisma' : 'drizzle',
          operation: found.operation,
          table: found.table,
          location: locationOf(ctx, node),
          ...(via === undefined ? {} : { via }),
          ...(inLoop ? { inLoop: true } : {}),
        };
        const key = `${call.operation}|${call.table}|${call.via ?? ''}|${inLoop}|${call.location.file}:${call.location.line}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(call);
        }
      } else if (depth < MAX_DEPTH) {
        const seenBodies = inLoop ? visited.inLoop : visited.once;
        for (const fn of calledFunctions(ctx, node)) {
          if (!seenBodies.has(fn.node)) {
            seenBodies.add(fn.node);
            walk(fn.node, via ?? fn.name, depth + 1, inLoop);
          }
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, via, depth, inLoop || repeats(node, child)));
  };

  walk(root, undefined, 0, false);
  return out;
}
