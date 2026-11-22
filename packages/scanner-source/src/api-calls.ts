/**
 * Поиск вызовов API в исходниках: прямые вызовы клиентов и вызовы обёрток
 * проекта, путь в которые передаёт вызывающий код.
 */
import ts from 'typescript';
import type { ApiClientKind, HttpMethod } from '@live-app-map/schema';
import { normalizeApiPath } from './api-match';
import { EMPTY_FRAME, lastName, type Frame, type FunctionNode } from './api-value';
import { sinkAt, type SinkHit } from './api-sinks';
import type { ValueEvaluator } from './value-evaluator';

/** Глубина подстановки обёрток: `api.get` → `request` → `fetch`. */
const MAX_INLINE = 4;

/** Найденный вызов API до присвоения id. */
export type FoundApiCall = {
  readonly node: ts.CallExpression;
  readonly method: HttpMethod;
  readonly path: string;
  readonly client: ApiClientKind;
  readonly via?: string;
};

/** Имя клиента для via: `this.api.post` → `api.post`. */
function viaOf(callee: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  return `${lastName(callee.expression.getText())}.${callee.name.text}`;
}

/** Обходит узлы по порядку (сначала узел, потом дети) и вызывает cb на каждом вызове. */
function forEachCall(root: ts.Node, cb: (call: ts.CallExpression) => void): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      cb(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/** Есть ли вызов, для которого pred истинно (обход прекращается на первом). */
function someCall(root: ts.Node, pred: (call: ts.CallExpression) => boolean): boolean {
  const visit = (node: ts.Node): boolean => (ts.isCallExpression(node) && pred(node)) || ts.forEachChild(node, visit) === true;
  return visit(root);
}

/** Путь задан здесь: литерал с '/' пришёл из аргументов этого вызова (id и прочее путь не задают). */
function pathFromHere(hit: SinkHit, call: ts.CallExpression): boolean {
  return hit.url.some((p) => p.origin === call && p.kind === 'lit' && p.text.includes('/'));
}

/**
 * Ищет вызовы API в файлах.
 */
export class ApiCallFinder {
  /** Доходит ли функция до вызова клиента (с подстановкой обёрток). */
  private readonly reach = new Map<FunctionNode, boolean>();

  constructor(private readonly ev: ValueEvaluator) {}

  /**
   * Вызовы API в файле.
   *
   * @param sf - исходник
   * @returns вызовы по порядку
   */
  collect(sf: ts.SourceFile): FoundApiCall[] {
    const out: FoundApiCall[] = [];
    forEachCall(sf, (node) => {
      out.push(...this.callsAt(node));
    });
    return out;
  }

  /** Вызовы API, путь которых задан в этом месте. */
  private callsAt(call: ts.CallExpression): FoundApiCall[] {
    const direct = sinkAt(this.ev, call, EMPTY_FRAME, call);
    if (direct !== undefined) {
      const found = this.found(call, direct, direct.client, direct.client === 'wrapper' ? viaOf(call.expression) : undefined);
      return found === undefined ? [] : [found];
    }
    const target = this.ev.functionsOf(call.expression);
    if (target === undefined || !target.fns.some((f) => this.reaches(f, 0))) {
      return [];
    }
    return this.wrapperCalls(call, target.fns, target.name);
  }

  /** Вызовы через обёртки: тела функций с аргументами этого вызова; повтор метода и пути — один. */
  private wrapperCalls(call: ts.CallExpression, fns: readonly FunctionNode[], via: string): FoundApiCall[] {
    const args = call.arguments.map((a) => this.ev.evaluate(a, EMPTY_FRAME, call));
    const out = new Map<string, FoundApiCall>();
    for (const fn of fns) {
      const hits = this.inlineHits(fn, this.ev.bind(fn, args), 1, new Set([fn])).filter((hit) => pathFromHere(hit, call));
      for (const found of hits.flatMap((hit) => this.found(call, hit, 'wrapper', via) ?? [])) {
        out.set(`${found.method} ${found.path}`, found);
      }
    }
    return [...out.values()];
  }

  private found(node: ts.CallExpression, hit: SinkHit, client: ApiClientKind, via: string | undefined): FoundApiCall | undefined {
    const path = normalizeApiPath(hit.url);
    if (path === undefined) {
      return undefined;
    }
    return { node, method: hit.method, path, client, ...(via === undefined ? {} : { via }) };
  }

  /** Вызовы клиентов в теле функции с подставленными аргументами, включая вложенные обёртки. */
  private inlineHits(fn: FunctionNode, frame: Frame, depth: number, stack: ReadonlySet<FunctionNode>): SinkHit[] {
    const out: SinkHit[] = [];
    if (fn.body !== undefined) {
      forEachCall(fn.body, (node) => {
        out.push(...this.hitsAt(node, frame, depth, stack));
      });
    }
    return out;
  }

  /** Вызов клиента в этом месте или вызовы во вложенной обёртке (до MAX_INLINE, без рекурсии). */
  private hitsAt(node: ts.CallExpression, frame: Frame, depth: number, stack: ReadonlySet<FunctionNode>): SinkHit[] {
    const hit = sinkAt(this.ev, node, frame, node);
    if (hit !== undefined) {
      return [hit];
    }
    const inner = depth < MAX_INLINE ? (this.ev.functionsOf(node.expression)?.fns.filter((f) => !stack.has(f) && this.reaches(f, 0)) ?? []) : [];
    if (inner.length === 0) {
      return [];
    }
    const args = node.arguments.map((a) => this.ev.evaluate(a, frame, node));
    return inner.flatMap((f) => this.inlineHits(f, this.ev.bind(f, args), depth + 1, new Set([...stack, f])));
  }

  /** Функция (или вызываемые ею функции проекта) вызывает HTTP-клиент. */
  private reaches(fn: FunctionNode, depth: number): boolean {
    const known = this.reach.get(fn);
    if (known !== undefined) {
      return known;
    }
    this.reach.set(fn, false);
    const result = fn.body !== undefined && someCall(fn.body, (node) => this.callReaches(node, fn, depth));
    this.reach.set(fn, result);
    return result;
  }

  /** Вызов — клиент или функция проекта (не fn), которая доходит до клиента. */
  private callReaches(node: ts.CallExpression, fn: FunctionNode, depth: number): boolean {
    if (sinkAt(this.ev, node, EMPTY_FRAME, node) !== undefined) {
      return true;
    }
    const target = depth < MAX_INLINE ? this.ev.functionsOf(node.expression) : undefined;
    return target?.fns.some((f) => f !== fn && this.reaches(f, depth + 1)) === true;
  }
}
