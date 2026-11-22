/**
 * HTTP-роуты Elysia, Hono и Express: метод, путь с префиксами, обработчик,
 * описание из комментариев и вызовы БД.
 */
import ts from 'typescript';
import type { ApiRoute, CodeComments, HttpMethod, RouteFramework } from '@live-app-map/schema';
import { commentsAt, commentsOf, describe } from './comments';
import { collectDbCalls } from './db-calls';
import { locationOf, resolvedSymbol, type SourceContext } from './source-context';
import type { RoutePaths } from './route-factories';
import { routeAccess } from './route-access';
import { optionalField } from './optional-field';
import { routeInput } from './route-input';
import { routeResponse } from './route-response';

const METHODS: ReadonlyMap<string, HttpMethod> = new Map<string, HttpMethod>([
  ['get', 'GET'],
  ['post', 'POST'],
  ['put', 'PUT'],
  ['patch', 'PATCH'],
  ['delete', 'DELETE'],
  ['options', 'OPTIONS'],
  ['head', 'HEAD'],
  ['all', 'ALL'],
]);

/** Приложение или роутер, к которому привязан вызов, и накопленный префикс. */
type AppRef = { readonly framework: RouteFramework; readonly prefix: string };

/** Роут без id и serviceId — их проставляет сборщик. */
export type FoundRoute = Omit<ApiRoute, 'id' | 'serviceId'>;

/**
 * Склеивает префикс и путь без двойных слешей.
 *
 * @param prefix - `/api` или пусто
 * @param p - путь роута
 * @returns полный путь
 */
export function joinPath(prefix: string, p: string): string {
  const joined = `${prefix}/${p}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

/**
 * Строковое значение выражения: литерал или const с литералом (в т. ч. импортированная).
 *
 * @param ctx - контекст
 * @param expr - выражение
 * @returns строка или undefined
 */
function stringValue(ctx: SourceContext, expr: ts.Expression | undefined): string | undefined {
  if (expr === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  const init = constInitializer(ctx, expr);
  return init === undefined ? undefined : stringValue(ctx, init);
}

/** Инициализатор константы или свойства объекта, на которые ссылается имя (`A`, `obj.a`). */
function constInitializer(ctx: SourceContext, expr: ts.Expression): ts.Expression | undefined {
  if (!ts.isIdentifier(expr) && !ts.isPropertyAccessExpression(expr)) {
    return undefined;
  }
  const decl = resolvedSymbol(ctx.checker, expr)?.valueDeclaration;
  return decl !== undefined && (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) ? decl.initializer : undefined;
}

/**
 * Префикс из `new Elysia({ prefix: '/api' })`.
 *
 * @param ctx - контекст
 * @param expr - new-выражение
 * @returns префикс или пустая строка
 */
function elysiaPrefix(ctx: SourceContext, expr: ts.NewExpression): string {
  const opts = expr.arguments?.[0];
  if (opts === undefined || !ts.isObjectLiteralExpression(opts)) {
    return '';
  }
  for (const prop of opts.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'prefix') {
      return stringValue(ctx, prop.initializer) ?? '';
    }
  }
  return '';
}

/** Состояние разрешения: Express-монтирования и защита от циклов. */
type ResolveState = {
  readonly mounts: ReadonlyMap<ts.Symbol, string>;
  readonly visiting: Set<ts.Node>;
};

/**
 * Определяет приложение по выражению-получателю: `new Elysia()`, `new Hono()`,
 * `express()`, `express.Router()`, цепочка вызовов, переменная, параметр `.group`.
 *
 * @param ctx - контекст
 * @param expr - выражение слева от `.get`
 * @param st - состояние разрешения
 * @returns AppRef или undefined, если это не веб-приложение
 */
function resolveApp(ctx: SourceContext, expr: ts.Expression, st: ResolveState): AppRef | undefined {
  if (st.visiting.has(expr)) {
    return undefined;
  }
  st.visiting.add(expr);
  try {
    return resolveAppInner(ctx, expr, st);
  } finally {
    st.visiting.delete(expr);
  }
}

function resolveAppInner(
  ctx: SourceContext,
  expr: ts.Expression,
  st: ResolveState,
): AppRef | undefined {
  if (ts.isParenthesizedExpression(expr) || ts.isAwaitExpression(expr)) {
    return resolveApp(ctx, expr.expression, st);
  }
  if (ts.isNewExpression(expr)) {
    return newApp(ctx, expr);
  }
  if (ts.isCallExpression(expr)) {
    return callApp(ctx, expr, st);
  }
  return ts.isIdentifier(expr) ? resolveIdentifier(ctx, expr, st) : undefined;
}

/** `new Elysia({ prefix })`, `new Hono()`. */
function newApp(ctx: SourceContext, expr: ts.NewExpression): AppRef | undefined {
  const name = ts.isIdentifier(expr.expression) ? expr.expression.text : '';
  if (name === 'Elysia') {
    return { framework: 'elysia', prefix: elysiaPrefix(ctx, expr) };
  }
  return name === 'Hono' ? { framework: 'hono', prefix: '' } : undefined;
}

/** `express`, `Router`, `express.Router`. */
function isExpressFactory(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) {
    return callee.text === 'express' || callee.text === 'Router';
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'Router' && callee.expression.getText() === 'express';
}

/** `express()`, `Router()`, `express.Router()`, шаг цепочки (`.basePath('/x')` добавляет префикс). */
function callApp(ctx: SourceContext, expr: ts.CallExpression, st: ResolveState): AppRef | undefined {
  const callee = expr.expression;
  if (isExpressFactory(callee)) {
    return { framework: 'express', prefix: '' };
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const base = resolveApp(ctx, callee.expression, st);
  return base !== undefined && callee.name.text === 'basePath' ? { ...base, prefix: joinPath(base.prefix, stringValue(ctx, expr.arguments[0]) ?? '') } : base;
}

/**
 * Переменная с приложением или параметр колбэка `.group('/p', (app) => …)`.
 */
function resolveIdentifier(
  ctx: SourceContext,
  id: ts.Identifier,
  st: ResolveState,
): AppRef | undefined {
  const sym = resolvedSymbol(ctx.checker, id);
  const decl = sym?.valueDeclaration;
  if (sym === undefined || decl === undefined) {
    return undefined;
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined) {
    return mountedApp(resolveApp(ctx, decl.initializer, st), st.mounts.get(sym));
  }
  return ts.isParameter(decl) ? groupParamApp(ctx, decl, st) : undefined;
}

/** Приложение с префиксом монтирования Express (`app.use('/v1', router)`). */
function mountedApp(app: AppRef | undefined, mount: string | undefined): AppRef | undefined {
  return app !== undefined && mount !== undefined ? { ...app, prefix: joinPath(mount, app.prefix) } : app;
}

/** Параметр колбэка `.group('/p', (app) => …)`: приложение группы с её префиксом. */
function groupParamApp(ctx: SourceContext, decl: ts.ParameterDeclaration, st: ResolveState): AppRef | undefined {
  const call = decl.parent.parent;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'group') {
    return undefined;
  }
  const base = resolveApp(ctx, call.expression.expression, st);
  return base === undefined ? undefined : { ...base, prefix: joinPath(base.prefix, stringValue(ctx, call.arguments[0]) ?? '') };
}

/**
 * Express: `app.use('/v1', router)` → префикс для роутов router.
 *
 * @param ctx - контекст
 * @param sf - файл
 * @returns символ роутера → префикс
 */
function collectMounts(ctx: SourceContext, sf: ts.SourceFile): Map<ts.Symbol, string> {
  const mounts = new Map<ts.Symbol, string>();
  const empty: ResolveState = { mounts, visiting: new Set() };
  const visit = (node: ts.Node): void => {
    const mount = ts.isCallExpression(node) ? mountAt(ctx, node, empty) : undefined;
    if (mount !== undefined) {
      mounts.set(mount[0], mount[1]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return mounts;
}

/** `app.use('/v1', router)` у Express-приложения: символ роутера и его префикс. */
function mountAt(ctx: SourceContext, node: ts.CallExpression, st: ResolveState): [ts.Symbol, string] | undefined {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'use' || node.arguments.length < 2) {
    return undefined;
  }
  const prefix = stringValue(ctx, node.arguments[0]);
  const app = resolveApp(ctx, callee.expression, st);
  const sym = mountedRouter(ctx, node.arguments[node.arguments.length - 1]);
  return prefix === undefined || sym === undefined || app?.framework !== 'express' ? undefined : [sym, joinPath(app.prefix, prefix)];
}

/** Символ роутера — последний аргумент-имя `use`. */
function mountedRouter(ctx: SourceContext, target: ts.Expression | undefined): ts.Symbol | undefined {
  return target !== undefined && ts.isIdentifier(target) ? resolvedSymbol(ctx.checker, target) : undefined;
}

/** Обработчик роута: имя, узел объявления и тело для поиска вызовов БД. */
type Handler = { readonly name?: string; readonly decl: ts.Node; readonly body: ts.Node };

/**
 * Обработчик — последний аргумент-функция или ссылка на функцию (объект опций пропускается).
 */
function findHandler(ctx: SourceContext, call: ts.CallExpression): Handler | undefined {
  const args = call.arguments.slice(1).filter((a) => !ts.isObjectLiteralExpression(a));
  const last = args[args.length - 1];
  if (last === undefined) {
    return undefined;
  }
  if (ts.isArrowFunction(last) || ts.isFunctionExpression(last)) {
    return { decl: last, body: last.body };
  }
  if (!ts.isIdentifier(last) && !ts.isPropertyAccessExpression(last)) {
    return undefined;
  }
  const name = ts.isIdentifier(last) ? last.text : last.name.text;
  const decl = resolvedSymbol(ctx.checker, last)?.valueDeclaration;
  return decl === undefined ? { name, decl: last, body: last } : namedHandler(name, decl);
}

/** Обработчик по объявлению: функция или метод с телом, константа (с её оператором), прочее как есть. */
function namedHandler(name: string, decl: ts.Declaration): Handler {
  if ((ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) && decl.body !== undefined) {
    return { name, decl, body: decl.body };
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined) {
    const stmt = decl.parent.parent;
    return { name, decl: ts.isVariableStatement(stmt) ? stmt : decl, body: decl.initializer };
  }
  return { name, decl, body: decl };
}

/**
 * Комментарии на месте вызова: перед `.get` в цепочке или перед выражением-оператором.
 */
function callSiteComments(call: ts.CallExpression, sf: ts.SourceFile): CodeComments {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee) && ts.isCallExpression(callee.expression)) {
    return commentsAt(sf.text, callee.expression.end);
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isNewExpression(callee.expression)) {
    return commentsAt(sf.text, callee.expression.end);
  }
  const stmt = ts.isExpressionStatement(call.parent) ? call.parent : call;
  return commentsOf(stmt, sf);
}

/** Верхнеуровневый оператор файла, внутри которого стоит узел. */
function topStatement(node: ts.Node): ts.Statement | undefined {
  let cur: ts.Node = node;
  while (cur.parent !== undefined && !ts.isSourceFile(cur.parent)) {
    cur = cur.parent;
  }
  return ts.isSourceFile(cur.parent) ? (cur as ts.Statement) : undefined;
}

/** Найденный вызов роута до сборки описания. */
type RawRoute = {
  readonly call: ts.CallExpression;
  /** Имя метода в вызове (`get`) — по нему строка роута. */
  readonly methodName: ts.Identifier;
  readonly app: AppRef;
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: Handler;
};

/**
 * Роуты файла.
 * Описание: комментарий у вызова → JSDoc обработчика → комментарий верхнего
 * оператора (если в нём один роут) → шапка файла (если в файле один роут).
 *
 * @param ctx - контекст
 * @param sf - файл
 * @param paths - пути, заданные не литералом (фабрики плагинов)
 * @returns найденные роуты
 */
export function collectRoutes(ctx: SourceContext, sf: ts.SourceFile, paths: RoutePaths): FoundRoute[] {
  const st: ResolveState = { mounts: collectMounts(ctx, sf), visiting: new Set() };
  const raw: RawRoute[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      raw.push(...routesAt(ctx, node, st, paths));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const perStatement = new Map<ts.Node | undefined, number>();
  for (const top of raw.map((r) => topStatement(r.call))) {
    perStatement.set(top, (perStatement.get(top) ?? 0) + 1);
  }
  const fileHeader = sf.statements[0] === undefined ? {} : commentsOf(sf.statements[0], sf);
  const docs: RouteDocs = { sf, perStatement, headerDoc: raw.length === 1 ? fileHeader.doc : undefined };
  return raw.map((r) => foundRoute(ctx, r, docs));
}

/** Роуты вызова `app.get(path, handler)`: путь литералом или из фабрики, приложение и обработчик найдены. */
function routesAt(ctx: SourceContext, node: ts.CallExpression, st: ResolveState, paths: RoutePaths): RawRoute[] {
  const callee = node.expression;
  const method = routeMethod(callee);
  if (method === undefined || !ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.name)) {
    return [];
  }
  const routePaths = routePathsOf(ctx, node.arguments[0], paths);
  const app = routePaths.length > 0 ? resolveApp(ctx, callee.expression, st) : undefined;
  const handler = app === undefined ? undefined : findHandler(ctx, node);
  if (app === undefined || handler === undefined) {
    return [];
  }
  const methodName = callee.name;
  return routePaths.map((routePath) => ({ call: node, methodName, app, method, path: joinPath(app.prefix, routePath), handler }));
}

/** HTTP-метод вызова `x.get(…)`; не метод роута — undefined. */
function routeMethod(callee: ts.Expression): HttpMethod | undefined {
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? METHODS.get(callee.name.text) : undefined;
}

/** Пути роута: литерал (или константа) первого аргумента, иначе пути фабрики. */
function routePathsOf(ctx: SourceContext, arg: ts.Expression | undefined, paths: RoutePaths): string[] {
  const literal = stringValue(ctx, arg);
  return literal === undefined ? paths.pathsOf(arg) : [literal];
}

/** Что нужно для описания роутов файла: число роутов в каждом верхнем операторе и шапка (если роут один). */
type RouteDocs = { readonly sf: ts.SourceFile; readonly perStatement: ReadonlyMap<ts.Node | undefined, number>; readonly headerDoc: string | undefined };

/** Описание роута: у вызова → JSDoc обработчика → верхний оператор с одним роутом → шапка файла. */
function routeDoc(r: RawRoute, site: CodeComments, docs: RouteDocs): string | undefined {
  const handlerDoc = r.handler.name === undefined ? {} : commentsOf(r.handler.decl, r.handler.decl.getSourceFile());
  const top = topStatement(r.call);
  const topDoc = top !== undefined && docs.perStatement.get(top) === 1 ? commentsOf(top, docs.sf) : {};
  return describe(site) ?? describe(handlerDoc) ?? describe(topDoc) ?? docs.headerDoc;
}

function foundRoute(ctx: SourceContext, r: RawRoute, docs: RouteDocs): FoundRoute {
  const site = callSiteComments(r.call, docs.sf);
  const doc = routeDoc(r, site, docs);
  const rest = (site.comments ?? []).filter((c) => c !== doc);
  return {
    framework: r.app.framework,
    method: r.method,
    path: r.path,
    location: locationOf(ctx, r.methodName),
    handler: {
      ...optionalField('name', r.handler.name),
      location: locationOf(ctx, r.handler.decl),
    },
    ...optionalField('doc', doc),
    ...(rest.length === 0 ? {} : { comments: rest }),
    dbCalls: collectDbCalls(ctx, r.handler.body),
    ...optionalField('input', routeInput(ctx, r.call, r.app.framework)),
    ...optionalField('access', routeAccess(ctx, r.call, r.handler.body)),
    ...optionalField('response', routeResponse(r.handler.body)),
  };
}
