/**
 * Вызовы API, достижимые из экрана: по вызовам функций, JSX-компонентам,
 * ссылкам на функции и сторам (`const useStore = create(…)`).
 */
import ts from 'typescript';
import type { ScreenApiCall } from '@live-app-map/schema';
import { functionOfDeclaration } from './api-value';
import { ownerInterface, type ImplementationIndex } from './implementations';
import { isProjectNode, resolvedSymbol, type SourceContext } from './source-context';

/** Глубина: экран → секция → виджет → хук → стор → обёртка … */
const MAX_DEPTH = 8;

/** Имя в собственном объявлении (`function A`, `const a`) — не ссылка. */
function isDeclarationName(id: ts.Identifier): boolean {
  const p = id.parent;
  return (
    (ts.isFunctionDeclaration(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isClassDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isParameter(p)) &&
    p.name === id
  );
}

/** Два абсолютных пути файлов принадлежат одному сервису. */
export type SameService = (a: string, b: string) => boolean;

/** Метод → тела реализаций по всем интерфейсам (кэш на индекс реализаций). */
const methodIndexCache = new WeakMap<ImplementationIndex, Map<string, { ifaces: number; bodies: ts.Node[] }>>();

/**
 * Реализации метода по имени, когда тип получателя не известен
 * (`useMemo(() => createApi(client))` без типов React): только если имя есть
 * не больше чем у двух интерфейсов — иначе это не отличить от случайного совпадения.
 */
function methodByName(ctx: SourceContext, id: ts.Identifier, sameService: SameService): ts.Node[] {
  if (!ts.isPropertyAccessExpression(id.parent) || id.parent.name !== id) {
    return [];
  }
  let index = methodIndexCache.get(ctx.implementations);
  if (index === undefined) {
    index = new Map();
    for (const methods of ctx.implementations.values()) {
      for (const [name, bodies] of methods) {
        const prev = index.get(name) ?? { ifaces: 0, bodies: [] };
        index.set(name, { ifaces: prev.ifaces + 1, bodies: [...prev.bodies, ...bodies] });
      }
    }
    methodIndexCache.set(ctx.implementations, index);
  }
  const found = index.get(id.text);
  const here = id.getSourceFile().fileName;
  return found !== undefined && found.ifaces <= 2 ? found.bodies.filter((b) => sameService(here, b.getSourceFile().fileName)) : [];
}

/** Сколько функций в объекте, который возвращает функция: фабрика клиента — 2 и больше. */
function returnedMethods(fn: ts.Node): number {
  let count = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n) && n !== fn) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression !== undefined && ts.isObjectLiteralExpression(n.expression)) {
      count = Math.max(count, n.expression.properties.filter((p) => ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && ts.isFunctionLike(p.initializer))).length);
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn, visit);
  return count;
}

/**
 * Куда ведёт ссылка: тело функции, реализации метода интерфейса или инициализатор стора.
 * Фабрики клиентов (`return { login, logout, … }`) целиком не обходятся —
 * экрану достаются только те методы, к которым он обращается.
 */
function targetsOf(ctx: SourceContext, id: ts.Identifier, sameService: SameService): ts.Node[] {
  const sym = resolvedSymbol(ctx.checker, id);
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (decl === undefined) {
    return methodByName(ctx, id, sameService);
  }
  if (!isProjectNode(ctx, decl)) {
    return [];
  }
  const fn = functionOfDeclaration(decl);
  if (fn !== undefined) {
    return returnedMethods(fn) >= 2 ? [] : [fn];
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined && ts.isCallExpression(decl.initializer)) {
    return [decl.initializer];
  }
  const iface = ownerInterface(decl);
  const impls = iface === undefined ? undefined : ctx.implementations.get(iface)?.get(id.text);
  return [...(impls ?? [])];
}

/**
 * Вызовы API экрана.
 *
 * @param ctx - контекст
 * @param roots - откуда начинается экран: файл экрана или узлы объекта роута
 * @param callIds - узел вызова → id найденных вызовов API
 * @param skipFiles - файлы других экранов и самого экрана: туда обход по ссылкам не заходит
 * @param sameService - два абсолютных файла в одном сервисе
 * @returns вызовы с первой функцией на пути
 */
export function screenApiCalls(
  ctx: SourceContext,
  roots: readonly ts.Node[],
  callIds: ReadonlyMap<ts.Node, readonly string[]>,
  skipFiles: ReadonlySet<string>,
  sameService: SameService,
): ScreenApiCall[] {
  const out = new Map<string, ScreenApiCall>();
  const visited = new Set<ts.Node>();
  const walk = (node: ts.Node, via: string | undefined, depth: number): void => {
    for (const id of callIds.get(node) ?? []) {
      if (!out.has(id)) {
        out.set(id, via === undefined ? { callId: id } : { callId: id, via });
      }
    }
    if (ts.isIdentifier(node) && depth < MAX_DEPTH && !isDeclarationName(node)) {
      for (const target of targetsOf(ctx, node, sameService)) {
        if (!skipFiles.has(target.getSourceFile().fileName) && !visited.has(target)) {
          visited.add(target);
          walk(target, via ?? node.text, depth + 1);
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, via, depth));
  };
  for (const root of roots) {
    walk(root, undefined, 0);
  }
  return [...out.values()];
}