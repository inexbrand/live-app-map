/**
 * Пути роутов из фабрик плагинов: `createCatalogAdminPlugin({ basePath: '/api/v1/x' })`
 * объявляет `.get(basePath, …)` — путь известен только в месте вызова фабрики.
 */
import ts from 'typescript';
import { EMPTY_FRAME, type FunctionNode, type Part } from './api-value';
import type { ValueEvaluator } from './value-evaluator';

/** Путь из частей: литералы как есть, неизвестное — `:имя`; undefined — остался параметр. */
function pathText(parts: readonly Part[]): string | undefined {
  let out = '';
  for (const p of parts) {
    if (p.kind === 'param') {
      return undefined;
    }
    out += p.kind === 'lit' ? p.text : p.kind === 'env' ? (p.base ?? '') : `:${p.name}`;
  }
  return out;
}

/** Ближайшая именованная функция вокруг узла (тело фабрики). */
function enclosingFunction(node: ts.Node): FunctionNode | undefined {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.body !== undefined) {
      return n;
    }
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent)) {
      return n;
    }
  }
  return undefined;
}

/** Имя функции для поиска вызовов по тексту. */
function nameOf(fn: FunctionNode): string | undefined {
  if (ts.isFunctionDeclaration(fn)) {
    return fn.name?.text;
  }
  return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined;
}

/**
 * Вычисляет пути роутов, в том числе через места вызова фабрик.
 */
export class RoutePaths {
  /** Имя функции → вызовы с таким именем (синтаксически, по всем файлам). */
  private callsByName: Map<string, ts.CallExpression[]> | undefined;

  constructor(
    private readonly ev: ValueEvaluator,
    private readonly files: readonly ts.SourceFile[],
  ) {}

  /**
   * Пути выражения: один, если он задан в самом коде, или по одному на вызов фабрики.
   *
   * @param expr - аргумент пути роута
   * @returns пути (пусто — путь не вычислить)
   */
  pathsOf(expr: ts.Expression | undefined): string[] {
    if (expr === undefined) {
      return [];
    }
    const value = this.ev.evaluate(expr, EMPTY_FRAME, expr);
    if (value.kind !== 'str') {
      return [];
    }
    const direct = pathText(value.parts);
    if (direct !== undefined) {
      return [direct];
    }
    const fn = enclosingFunction(expr);
    const name = fn === undefined ? undefined : nameOf(fn);
    return fn === undefined || name === undefined ? [] : this.boundPaths(expr, fn, name);
  }

  /** Пути выражения внутри фабрики при каждом её вызове с подставленными аргументами (без повторов). */
  private boundPaths(expr: ts.Expression, fn: FunctionNode, name: string): string[] {
    const out = new Set<string>();
    for (const call of this.callsNamed(name).filter((c) => this.ev.functionsOf(c.expression)?.fns.includes(fn) === true)) {
      const args = call.arguments.map((a) => this.ev.evaluate(a, EMPTY_FRAME, call));
      const v = this.ev.evaluate(expr, this.ev.bind(fn, args), expr);
      const text = v.kind === 'str' ? pathText(v.parts) : undefined;
      if (text !== undefined) {
        out.add(text);
      }
    }
    return [...out];
  }

  private callsNamed(name: string): readonly ts.CallExpression[] {
    if (this.callsByName === undefined) {
      const index = new Map<string, ts.CallExpression[]>();
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const list = index.get(node.expression.text) ?? [];
          list.push(node);
          index.set(node.expression.text, list);
        }
        ts.forEachChild(node, visit);
      };
      for (const sf of this.files) {
        visit(sf);
      }
      this.callsByName = index;
    }
    return this.callsByName.get(name) ?? [];
  }
}
