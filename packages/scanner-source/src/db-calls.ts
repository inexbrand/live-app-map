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
  if (ts.isForStatement(parent)) {
    return child !== parent.initializer;
  }
  return ts.isWhileStatement(parent) || ts.isDoStatement(parent) || isLoopCallback(parent, child);
}

/** Колбэк метода-цикла массива: `.map(x => …)`. */
function isLoopCallback(parent: ts.Node, child: ts.Node): boolean {
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    LOOP_METHODS.has(parent.expression.name.text) &&
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
  return drizzleWrite(ctx, call, method, table) ?? drizzleQuery(method, receiver);
}

/** `db.insert(t)` / `update` / `delete`: таблица известна или получатель похож на клиент БД. */
function drizzleWrite(ctx: SourceContext, call: ts.CallExpression, method: string, table: string | undefined): { operation: DbOperation; table: string } | undefined {
  const write = DRIZZLE_WRITE.get(method);
  if (write === undefined || table === undefined || call.arguments.length !== 1 || !ts.isPropertyAccessExpression(call.expression)) {
    return undefined;
  }
  return ctx.drizzleTables.has(table) || DB_RECEIVER.test(call.expression.expression.getText()) ? { operation: write, table } : undefined;
}

/** `db.query.<table>.findMany()` / `findFirst()`. */
function drizzleQuery(method: string, receiver: ts.Expression): { operation: DbOperation; table: string } | undefined {
  const isQuery =
    (method === 'findMany' || method === 'findFirst') &&
    ts.isPropertyAccessExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === 'query';
  return isQuery && ts.isPropertyAccessExpression(receiver) ? { operation: 'select', table: receiver.name.text } : undefined;
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
  const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
  const decl = ts.isIdentifier(callee) ? projectDeclaration(ctx, callee) : undefined;
  if (decl === undefined || !ts.isIdentifier(callee)) {
    return [];
  }
  const body = functionBody(decl);
  return body === undefined ? implementationBodies(ctx, decl, callee.text) : [{ name: callee.text, node: body }];
}

/** Объявление имени в проекте (не в библиотеках). */
function projectDeclaration(ctx: SourceContext, id: ts.Identifier): ts.Declaration | undefined {
  const sym = resolvedSymbol(ctx.checker, id);
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  return decl !== undefined && isProjectNode(ctx, decl) ? decl : undefined;
}

/** Тело функции, метода или стрелки в константе. */
function functionBody(decl: ts.Declaration): ts.Node | undefined {
  if (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) {
    return decl.body;
  }
  const init = ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
  return init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init.body : undefined;
}

/** Тела реализаций метода интерфейса, которому принадлежит объявление. */
function implementationBodies(ctx: SourceContext, decl: ts.Declaration, method: string): Callee[] {
  const iface = ownerInterface(decl);
  const impls = iface === undefined ? undefined : ctx.implementations.get(iface)?.get(method);
  return (impls ?? []).map((node) => ({ name: `${iface}.${method}`, node }));
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
  const walker = new DbCallWalker(ctx, root);
  walker.walk(root, undefined, 0, false);
  return walker.out;
}

/** Обход тела с заходом в функции проекта; вызовы БД без повторов. */
class DbCallWalker {
  readonly out: DbCall[] = [];
  private readonly seen = new Set<string>();
  /** Тело, обойдённое вне цикла и в цикле, — разные случаи: в цикле это N+1. */
  private readonly visited: { readonly inLoop: Set<ts.Node>; readonly once: Set<ts.Node> };

  constructor(
    private readonly ctx: SourceContext,
    root: ts.Node,
  ) {
    this.visited = { inLoop: new Set<ts.Node>(), once: new Set<ts.Node>([root]) };
  }

  walk(node: ts.Node, via: string | undefined, depth: number, inLoop: boolean): void {
    if (ts.isCallExpression(node)) {
      this.visitCall(node, via, depth, inLoop);
    }
    ts.forEachChild(node, (child) => this.walk(child, via, depth, inLoop || repeats(node, child)));
  }

  /** Вызов БД — записать; иначе зайти в вызываемые функции проекта (до MAX_DEPTH, каждое тело — раз). */
  private visitCall(node: ts.CallExpression, via: string | undefined, depth: number, inLoop: boolean): void {
    const call = this.dbCallOf(node, via, inLoop);
    if (call !== undefined) {
      this.record(call);
    } else if (depth < MAX_DEPTH) {
      this.enterCallees(node, via, depth, inLoop);
    }
  }

  /** Обращение к БД в вызове (Drizzle, иначе Prisma). */
  private dbCallOf(node: ts.CallExpression, via: string | undefined, inLoop: boolean): DbCall | undefined {
    const drizzle = drizzleCall(this.ctx, node);
    const found = drizzle ?? prismaCall(this.ctx, node);
    return found === undefined
      ? undefined
      : {
          orm: drizzle === undefined ? 'prisma' : 'drizzle',
          operation: found.operation,
          table: found.table,
          location: locationOf(this.ctx, node),
          ...(via === undefined ? {} : { via }),
          ...(inLoop ? { inLoop: true } : {}),
        };
  }

  /** Заход в функции проекта, которые вызывает узел; каждое тело — раз (отдельно в цикле и вне). */
  private enterCallees(node: ts.CallExpression, via: string | undefined, depth: number, inLoop: boolean): void {
    const seenBodies = inLoop ? this.visited.inLoop : this.visited.once;
    for (const fn of calledFunctions(this.ctx, node)) {
      // Проверка на каждом шаге: тело могло быть обойдено внутри предыдущего.
      if (!seenBodies.has(fn.node)) {
        seenBodies.add(fn.node);
        this.walk(fn.node, via ?? fn.name, depth + 1, inLoop);
      }
    }
  }

  private record(call: DbCall): void {
    const key = `${call.operation}|${call.table}|${call.via ?? ''}|${call.inLoop === true}|${call.location.file}:${call.location.line}`;
    if (!this.seen.has(key)) {
      this.seen.add(key);
      this.out.push(call);
    }
  }
}
