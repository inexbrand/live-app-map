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
import { routeInput } from './route-input';
import { routeResponse } from './route-response';

/** Поле объекта только со значением: `{}` для undefined. */
function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  if (value !== undefined) {
    out[key] = value;
  }
  return out;
}

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
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
    const decl = resolvedSymbol(ctx.checker, expr)?.valueDeclaration;
    if (
      decl !== undefined &&
      (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) &&
      decl.initializer !== undefined
    ) {
      return stringValue(ctx, decl.initializer);
    }
  }
  return undefined;
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
  if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression)) {
    const name = expr.expression.text;
    if (name === 'Elysia') {
      return { framework: 'elysia', prefix: elysiaPrefix(ctx, expr) };
    }
    if (name === 'Hono') {
      return { framework: 'hono', prefix: '' };
    }
    return undefined;
  }
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee) && (callee.text === 'express' || callee.text === 'Router')) {
      return { framework: 'express', prefix: '' };
    }
    if (ts.isPropertyAccessExpression(callee)) {
      if (callee.name.text === 'Router' && callee.expression.getText() === 'express') {
        return { framework: 'express', prefix: '' };
      }
      const base = resolveApp(ctx, callee.expression, st);
      if (base !== undefined && callee.name.text === 'basePath') {
        return { ...base, prefix: joinPath(base.prefix, stringValue(ctx, expr.arguments[0]) ?? '') };
      }
      return base;
    }
    return undefined;
  }
  if (ts.isIdentifier(expr)) {
    return resolveIdentifier(ctx, expr, st);
  }
  return undefined;
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
    const app = resolveApp(ctx, decl.initializer, st);
    const mount = st.mounts.get(sym);
    return app !== undefined && mount !== undefined ? { ...app, prefix: joinPath(mount, app.prefix) } : app;
  }
  if (ts.isParameter(decl)) {
    const fn = decl.parent;
    const call = fn.parent;
    if (
      ts.isCallExpression(call) &&
      ts.isPropertyAccessExpression(call.expression) &&
      call.expression.name.text === 'group'
    ) {
      const base = resolveApp(ctx, call.expression.expression, st);
      const groupPath = stringValue(ctx, call.arguments[0]) ?? '';
      return base === undefined ? undefined : { ...base, prefix: joinPath(base.prefix, groupPath) };
    }
  }
  return undefined;
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
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'use' &&
      node.arguments.length >= 2
    ) {
      const prefix = stringValue(ctx, node.arguments[0]);
      const target = node.arguments[node.arguments.length - 1];
      const app = resolveApp(ctx, node.expression.expression, empty);
      if (prefix !== undefined && target !== undefined && ts.isIdentifier(target) && app?.framework === 'express') {
        const sym = resolvedSymbol(ctx.checker, target);
        if (sym !== undefined) {
          mounts.set(sym, joinPath(app.prefix, prefix));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return mounts;
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
  if (decl === undefined) {
    return { name, decl: last, body: last };
  }
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
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
      const methodName = node.expression.name;
      const method = METHODS.get(methodName.text);
      const literal = method === undefined ? undefined : stringValue(ctx, node.arguments[0]);
      const routePaths = literal !== undefined ? [literal] : method === undefined ? [] : paths.pathsOf(node.arguments[0]);
      if (method !== undefined && routePaths.length > 0) {
        const app = resolveApp(ctx, node.expression.expression, st);
        const handler = app === undefined ? undefined : findHandler(ctx, node);
        if (app !== undefined && handler !== undefined) {
          for (const routePath of routePaths) {
            raw.push({ call: node, methodName, app, method, path: joinPath(app.prefix, routePath), handler });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const perStatement = new Map<ts.Node | undefined, number>();
  for (const r of raw) {
    const top = topStatement(r.call);
    perStatement.set(top, (perStatement.get(top) ?? 0) + 1);
  }
  const fileHeader = sf.statements[0] === undefined ? {} : commentsOf(sf.statements[0], sf);

  return raw.map((r) => {
    const site = callSiteComments(r.call, sf);
    const handlerDoc = r.handler.name === undefined ? {} : commentsOf(r.handler.decl, r.handler.decl.getSourceFile());
    const top = topStatement(r.call);
    const topDoc = top !== undefined && perStatement.get(top) === 1 ? commentsOf(top, sf) : {};
    const headerDoc = raw.length === 1 ? { doc: fileHeader.doc } : {};
    const doc = describe(site) ?? describe(handlerDoc) ?? describe(topDoc) ?? headerDoc.doc;
    const rest = (site.comments ?? []).filter((c) => c !== doc);
    return {
      framework: r.app.framework,
      method: r.method,
      path: r.path,
      location: locationOf(ctx, r.methodName),
      handler: {
        ...(r.handler.name === undefined ? {} : { name: r.handler.name }),
        location: locationOf(ctx, r.handler.decl),
      },
      ...(doc === undefined ? {} : { doc }),
      ...(rest.length === 0 ? {} : { comments: rest }),
      dbCalls: collectDbCalls(ctx, r.handler.body),
      ...optional('input', routeInput(ctx, r.call, r.app.framework)),
      ...optional('access', routeAccess(ctx, r.call, r.handler.body)),
      ...optional('response', routeResponse(r.handler.body)),
    };
  });
}
