/**
 * Вызовы API, достижимые из экрана: по вызовам функций, JSX-компонентам,
 * ссылкам на функции и сторам (`const useStore = create(…)`).
 */
import ts from 'typescript';
import type { ScreenApiCall } from '@live-app-map/schema';
import { functionOfDeclaration } from './api-value';
import { isProjectNode, resolvedSymbol, type SourceContext } from './source-context';

/** Глубина: экран → секция → виджет → хук → стор → обёртка … */
const MAX_DEPTH = 8;

/** Куда ведёт ссылка: тело функции или инициализатор стора. */
function targetOf(ctx: SourceContext, id: ts.Identifier): ts.Node | undefined {
  const sym = resolvedSymbol(ctx.checker, id);
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (decl === undefined || !isProjectNode(ctx, decl)) {
    return undefined;
  }
  const fn = functionOfDeclaration(decl);
  if (fn !== undefined) {
    return fn;
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined && ts.isCallExpression(decl.initializer)) {
    return decl.initializer;
  }
  return undefined;
}

/**
 * Вызовы API экрана.
 *
 * @param ctx - контекст
 * @param entry - файл экрана
 * @param callIds - узел вызова → id найденных вызовов API
 * @param entryFiles - файлы всех экранов: в чужие экраны обход не заходит
 * @returns вызовы с первой функцией на пути
 */
export function screenApiCalls(
  ctx: SourceContext,
  entry: ts.SourceFile,
  callIds: ReadonlyMap<ts.Node, readonly string[]>,
  entryFiles: ReadonlySet<string>,
): ScreenApiCall[] {
  const out = new Map<string, ScreenApiCall>();
  const visited = new Set<ts.Node>();
  const walk = (node: ts.Node, via: string | undefined, depth: number): void => {
    for (const id of callIds.get(node) ?? []) {
      if (!out.has(id)) {
        out.set(id, via === undefined ? { callId: id } : { callId: id, via });
      }
    }
    if (ts.isIdentifier(node) && depth < MAX_DEPTH) {
      const target = targetOf(ctx, node);
      const file = target?.getSourceFile().fileName;
      if (target !== undefined && file !== entry.fileName && file !== undefined && !entryFiles.has(file) && !visited.has(target)) {
        visited.add(target);
        walk(target, via ?? node.text, depth + 1);
      }
    }
    ts.forEachChild(node, (child) => walk(child, via, depth));
  };
  walk(entry, undefined, 0);
  return [...out.values()];
}
