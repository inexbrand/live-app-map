/**
 * Экран React Router: объект роута в конфиге (`{ path, Component | element | lazy }`)
 * и модули, которые он подгружает (`lazy: () => import('./x')`, `lazyRoute('id')` → карта загрузчиков).
 */
import ts from 'typescript';
import { functionOfDeclaration } from './api-value';
import { joinPath } from './routes';
import { resolvedSymbol, type SourceContext } from './source-context';

/** Предел глубины разбора lazy. */
const MAX_DEPTH = 6;

/** Свойства объекта роута, из которых рендерится экран. */
const SCREEN_PROPS: ReadonlySet<string> = new Set(['element', 'Component', 'component', 'lazy', 'loader']);

/** Значение свойства объектного литерала. */
function propOf(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText().replace(/['"]/g, '') === name) {
      return p.initializer;
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) {
      return p.name;
    }
  }
  return undefined;
}

/** Объект роута: литерал или результат локальной фабрики (`tabRoute('feed', 'feed')`) с подставленными аргументами. */
type RouteShape = {
  /** Узел в дереве конфига: литерал или вызов фабрики. */
  readonly anchor: ts.Node;
  readonly obj: ts.ObjectLiteralExpression;
  /** Параметр фабрики → строковый аргумент вызова. */
  readonly binds: ReadonlyMap<string, string>;
};

/** Строка из литерала или параметра фабрики. */
function strOf(expr: ts.Expression | undefined, binds: ReadonlyMap<string, string>): string | undefined {
  if (expr === undefined) {
    return undefined;
  }
  if (ts.isStringLiteralLike(expr)) {
    return expr.text;
  }
  return ts.isIdentifier(expr) ? binds.get(expr.text) : undefined;
}

/** Объектный литерал, который функция возвращает: `=> ({…})` или единственный `return {…}`. */
function returnedObject(body: ts.Node): ts.ObjectLiteralExpression | undefined {
  let e: ts.Node | undefined = body;
  if (ts.isBlock(body)) {
    const ret = body.statements.find(ts.isReturnStatement);
    e = ret?.expression;
  }
  while (e !== undefined && ts.isParenthesizedExpression(e)) {
    e = e.expression;
  }
  return e !== undefined && ts.isObjectLiteralExpression(e) ? e : undefined;
}

/** Узел конфига как объект роута. */
function routeShape(ctx: SourceContext, n: ts.Node): RouteShape | undefined {
  if (ts.isObjectLiteralExpression(n)) {
    return { anchor: n, obj: n, binds: new Map() };
  }
  if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) {
    return undefined;
  }
  const fn = localFunction(ctx, n.expression);
  const obj = fn?.body === undefined ? undefined : returnedObject(fn.body);
  return fn === undefined || obj === undefined ? undefined : { anchor: n, obj, binds: bindArgs(fn, n, new Map()) };
}

/** Функция проекта, на которую ссылается имя. */
function localFunction(ctx: SourceContext, id: ts.Identifier): ReturnType<typeof functionOfDeclaration> {
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  return decl === undefined ? undefined : functionOfDeclaration(decl);
}

/** Параметры функции → строковые аргументы вызова (поверх внешних привязок). */
function bindArgs(fn: NonNullable<ReturnType<typeof functionOfDeclaration>>, call: ts.CallExpression, binds: ReadonlyMap<string, string>): Map<string, string> {
  const inner = new Map(binds);
  fn.parameters.forEach((p, i) => {
    const v = strOf(call.arguments[i], binds);
    if (ts.isIdentifier(p.name) && v !== undefined) {
      inner.set(p.name.text, v);
    }
  });
  return inner;
}

/** Путь объекта роута с учётом родителей (`children`); index-роут — путь родителя. */
function fullPath(shape: RouteShape): string | undefined {
  const seg = ownSegment(shape);
  if (seg === undefined) {
    return undefined;
  }
  const prefix = parentPrefix(shape.anchor);
  return seg.startsWith('/') ? seg : joinPath(prefix === '' ? '/' : prefix, seg);
}

/** Свой сегмент: path (литерал или параметр фабрики), у index-роута — пусто; иначе undefined. */
function ownSegment(shape: RouteShape): string | undefined {
  const own = propOf(shape.obj, 'path');
  if (own !== undefined) {
    return strOf(own, shape.binds);
  }
  return propOf(shape.obj, 'index')?.kind === ts.SyntaxKind.TrueKeyword ? '' : undefined;
}

/** Префикс из path родительских объектов роута (`children`). */
function parentPrefix(anchor: ts.Node): string {
  let prefix = '';
  for (let n: ts.Node = anchor.parent; !ts.isSourceFile(n); n = n.parent) {
    const parent = ts.isObjectLiteralExpression(n) ? propOf(n, 'path') : undefined;
    if (parent !== undefined && ts.isStringLiteralLike(parent)) {
      prefix = joinPath(parent.text.startsWith('/') ? parent.text : `/${parent.text}`, prefix);
    }
  }
  return prefix;
}

/**
 * Путь для сравнения: без хвостового '/', параметры без имён —
 * `:id`, `[id]` → `:`, `*`, `[...rest]` → `*`.
 */
function norm(p: string): string {
  const t = p
    .replace(/\[\[?\.\.\.[^\]]+\]\]?/g, '*')
    .replace(/\[[^\]]+\]/g, ':')
    .replace(/:[\w$]+\??/g, ':')
    .replace(/\/+$/, '');
  return t.startsWith('/') ? t : `/${t}`;
}

/**
 * Модули, которые подгружает выражение lazy-роута.
 */
function lazyModules(ctx: SourceContext, expr: ts.Expression, binds: ReadonlyMap<string, string>, depth: number): ts.SourceFile[] {
  if (depth > MAX_DEPTH) {
    return [];
  }
  const next = depth + 1;
  if (isWrapper(expr)) {
    return lazyModules(ctx, expr.expression, binds, next);
  }
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    return bodyModules(ctx, expr.body, binds, next);
  }
  if (ts.isCallExpression(expr)) {
    return callModules(ctx, expr, binds, next);
  }
  return ts.isElementAccessExpression(expr) || ts.isPropertyAccessExpression(expr) ? accessModules(ctx, expr, binds, next) : [];
}

/** Обёртка выражения: скобки, await, as, satisfies. */
function isWrapper(expr: ts.Expression): expr is ts.ParenthesizedExpression | ts.AwaitExpression | ts.AsExpression | ts.SatisfiesExpression {
  return ts.isParenthesizedExpression(expr) || ts.isAwaitExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr);
}

/** Модуль `import('./x')` (файл проекта). */
function importedModule(ctx: SourceContext, expr: ts.CallExpression): ts.SourceFile[] {
  const arg = expr.arguments[0];
  const decl = arg === undefined ? undefined : ctx.checker.getSymbolAtLocation(arg)?.valueDeclaration;
  return decl !== undefined && ts.isSourceFile(decl) ? [decl] : [];
}

/** `import('./x')`, `p.then(…)`, вызов локальной фабрики загрузчика, иначе вызываемое выражение. */
function callModules(ctx: SourceContext, expr: ts.CallExpression, binds: ReadonlyMap<string, string>, next: number): ts.SourceFile[] {
  if (expr.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return importedModule(ctx, expr);
  }
  if (ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'then') {
    return lazyModules(ctx, expr.expression.expression, binds, next);
  }
  const fn = ts.isIdentifier(expr.expression) ? localFunction(ctx, expr.expression) : undefined;
  if (fn?.body !== undefined) {
    return bodyModules(ctx, fn.body, bindArgs(fn, expr, binds), next);
  }
  return lazyModules(ctx, expr.expression, binds, next);
}

/** Ключ доступа: `.key`, `['key']`, `[param]` фабрики. */
function accessKey(expr: ts.ElementAccessExpression | ts.PropertyAccessExpression, binds: ReadonlyMap<string, string>): string | undefined {
  const keyNode = ts.isPropertyAccessExpression(expr) ? expr.name : expr.argumentExpression;
  if (ts.isStringLiteralLike(keyNode)) {
    return keyNode.text;
  }
  if (!ts.isIdentifier(keyNode)) {
    return undefined;
  }
  return ts.isPropertyAccessExpression(expr) ? keyNode.text : binds.get(keyNode.text);
}

/** `LOADERS[id]`, `LOADERS.feed`: значение карты загрузчиков. */
function accessModules(ctx: SourceContext, expr: ts.ElementAccessExpression | ts.PropertyAccessExpression, binds: ReadonlyMap<string, string>, next: number): ts.SourceFile[] {
  const key = accessKey(expr, binds);
  const obj = objectLiteralOf(ctx, expr.expression);
  const value = obj === undefined || key === undefined ? undefined : propOf(obj, key);
  return value === undefined ? [] : lazyModules(ctx, value, binds, next);
}

/** Модули из тела функции: выражение стрелки или выражения `return`. */
function bodyModules(ctx: SourceContext, body: ts.Node, binds: ReadonlyMap<string, string>, depth: number): ts.SourceFile[] {
  if (!ts.isBlock(body)) {
    return ts.isExpression(body) ? lazyModules(ctx, body, binds, depth) : [];
  }
  const out: ts.SourceFile[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression !== undefined) {
      out.push(...lazyModules(ctx, n.expression, binds, depth));
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

/** Объектный литерал, на который указывает выражение (константа-карта загрузчиков). */
function objectLiteralOf(ctx: SourceContext, expr: ts.Expression): ts.ObjectLiteralExpression | undefined {
  const init = ts.isIdentifier(expr) ? constInit(ctx, expr) : expr;
  let e = init;
  while (e !== undefined && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e))) {
    e = e.expression;
  }
  return e !== undefined && ts.isObjectLiteralExpression(e) ? e : undefined;
}

/** Инициализатор константы, на которую ссылается имя. */
function constInit(ctx: SourceContext, id: ts.Identifier): ts.Expression | undefined {
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  return decl !== undefined && ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
}

/**
 * Экран по id роута из карты загрузчиков (`ROUTE_MODULE_LOADERS[id]`): так шелл
 * рендерит табы, у которых в роуте нет элемента. Ищутся объекты-константы,
 * на которые ссылается файл конфига.
 */
function loaderRoots(ctx: SourceContext, sf: ts.SourceFile, id: string): ts.SourceFile[] {
  const seen = new Set<ts.ObjectLiteralExpression>();
  const out: ts.SourceFile[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const obj = objectLiteralOf(ctx, n);
      if (obj !== undefined && !seen.has(obj)) {
        seen.add(obj);
        const value = propOf(obj, id);
        if (value !== undefined) {
          out.push(...lazyModules(ctx, value, new Map(), 0));
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Узлы экрана из объекта роута: `element`/`Component`, модули `lazy`, загрузчик по `id`. */
function shapeRoots(ctx: SourceContext, sf: ts.SourceFile, shape: RouteShape): ts.Node[] {
  const roots: ts.Node[] = [];
  for (const name of SCREEN_PROPS) {
    const v = propOf(shape.obj, name);
    if (v === undefined || v.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(v) && shape.binds.has(v.text))) {
      continue;
    }
    roots.push(...(name === 'lazy' ? lazyModules(ctx, v, shape.binds, 0) : [v]));
  }
  const id = strOf(propOf(shape.obj, 'id'), shape.binds);
  return roots.length === 0 && id !== undefined ? loaderRoots(ctx, sf, id) : roots;
}

/**
 * Узлы, с которых начинается экран RR: выражения `element`/`Component`, модули `lazy`,
 * для таба без элемента — модуль из карты загрузчиков по id роута.
 *
 * @param ctx - контекст
 * @param sf - файл конфига роутов
 * @param routePath - путь экрана (`/applications/:id/submit`)
 * @returns узлы для обхода (пусто — объект роута не найден или у него нет экрана)
 */
export function rrScreenRoots(ctx: SourceContext, sf: ts.SourceFile, routePath: string): ts.Node[] {
  const target = norm(routePath);
  const roots: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    const shape = routeShape(ctx, n);
    const p = shape === undefined ? undefined : fullPath(shape);
    if (shape !== undefined && p !== undefined && norm(p) === target) {
      roots.push(...shapeRoots(ctx, sf, shape));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return roots;
}

/**
 * Первый статический сегмент пути экрана: `/users/[id]` → `users`.
 *
 * @param routePath - путь экрана
 * @returns раздел или undefined для корня
 */
export function routeSection(routePath: string): string | undefined {
  const first = norm(routePath).split('/').find((s) => s !== '');
  return first === undefined || first === ':' || first === '*' ? undefined : first;
}
