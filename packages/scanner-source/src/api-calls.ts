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
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        out.push(...this.callsAt(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  /** Вызовы API, путь которых задан в этом месте. */
  private callsAt(call: ts.CallExpression): FoundApiCall[] {
    const direct = sinkAt(this.ev, call, EMPTY_FRAME, call);
    if (direct !== undefined) {
      const via = direct.client === 'wrapper' ? viaOf(call.expression) : undefined;
      const found = this.found(call, direct, direct.client, via);
      return found === undefined ? [] : [found];
    }
    const target = this.ev.functionsOf(call.expression);
    if (target === undefined || !target.fns.some((f) => this.reaches(f, 0))) {
      return [];
    }
    const args = call.arguments.map((a) => this.ev.evaluate(a, EMPTY_FRAME, call));
    const out = new Map<string, FoundApiCall>();
    for (const fn of target.fns) {
      for (const hit of this.inlineHits(fn, this.ev.bind(fn, args), 1, new Set([fn]))) {
        // Путь задан здесь, если литерал с '/' пришёл из аргументов этого вызова;
        // id и прочие значения вызывающего путь не задают.
        if (hit.url.some((p) => p.origin === call && p.kind === 'lit' && p.text.includes('/'))) {
          const found = this.found(call, hit, 'wrapper', target.name);
          if (found !== undefined) {
            out.set(`${found.method} ${found.path}`, found);
          }
        }
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
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const hit = sinkAt(this.ev, node, frame, node);
        if (hit !== undefined) {
          out.push(hit);
        } else if (depth < MAX_INLINE) {
          const target = this.ev.functionsOf(node.expression);
          const inner = target?.fns.filter((f) => !stack.has(f) && this.reaches(f, 0)) ?? [];
          if (inner.length > 0) {
            const args = node.arguments.map((a) => this.ev.evaluate(a, frame, node));
            for (const f of inner) {
              out.push(...this.inlineHits(f, this.ev.bind(f, args), depth + 1, new Set([...stack, f])));
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (fn.body !== undefined) {
      visit(fn.body);
    }
    return out;
  }

  /** Функция (или вызываемые ею функции проекта) вызывает HTTP-клиент. */
  private reaches(fn: FunctionNode, depth: number): boolean {
    const known = this.reach.get(fn);
    if (known !== undefined) {
      return known;
    }
    this.reach.set(fn, false);
    let result = false;
    const visit = (node: ts.Node): void => {
      if (result) {
        return;
      }
      if (ts.isCallExpression(node)) {
        if (sinkAt(this.ev, node, EMPTY_FRAME, node) !== undefined) {
          result = true;
          return;
        }
        const target = depth < MAX_INLINE ? this.ev.functionsOf(node.expression) : undefined;
        if (target?.fns.some((f) => f !== fn && this.reaches(f, depth + 1)) === true) {
          result = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    if (fn.body !== undefined) {
      visit(fn.body);
    }
    this.reach.set(fn, result);
    return result;
  }
}
