/**
 * Разбор выражений схемы в исходнике: конструктор t.X / z.x с цепочкой методов, литералы, значения const.
 */
import ts from 'typescript';
import { resolvedSymbol, type SourceContext } from './source-context';

export const TEXT_MAX = 200;
/** Глубина вложенности схем, до которой константы раскрываются (защита от циклов). */
export const MAX_DEPTH = 8;


/** Текст узла одной строкой до предела. */
export function short(node: ts.Node): string {
  const t = node.getText().replace(/\s+/g, ' ').trim();
  return t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX - 1)}…` : t;
}

/** Вызов конструктора схемы: `t.String(...)` / `z.string()` — пространство и имя. */
export type Ctor = { readonly ns: string; readonly name: string; readonly call: ts.CallExpression };

/**
 * Базовый конструктор цепочки zod или вызов TypeBox: `z.string().min(1).optional()` →
 * `z.string()`; методы цепочки после него.
 */
export function baseCtor(expr: ts.Expression): { ctor?: Ctor; methods: string[] } {
  const methods: string[] = [];
  let cur: ts.Expression = expr;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    const target = cur.expression.expression;
    const ns = ts.isIdentifier(target) ? target.text : ts.isPropertyAccessExpression(target) ? target.getText() : undefined;
    if (ns !== undefined && /^(t|Type|z|z\.coerce)$/.test(ns)) {
      return { ctor: { ns: ns.startsWith('z') ? 'z' : 't', name: cur.expression.name.text, call: cur }, methods };
    }
    methods.unshift(cur.expression.name.text);
    cur = target;
  }
  return { methods };
}

/** Литерал строкой: `'a'`, `1`, `true`. */
export function literalText(expr: ts.Expression | undefined): string | undefined {
  if (expr === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return `'${expr.text}'`;
  }
  return ts.isNumericLiteral(expr) || expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword
    ? expr.getText()
    : undefined;
}

/** Выражение без `as const`, `satisfies`, скобок. */
export function unwrap(expr: ts.Expression): ts.Expression {
  return ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isParenthesizedExpression(expr) ? unwrap(expr.expression) : expr;
}

/**
 * Значения из константы-массива: `t.Union(TYPES.map((v) => t.Literal(v)))`, `z.enum(TYPES)` →
 * `'a' | 'b'`; константа не массив литералов — «одно из TYPES».
 *
 * @param ctx - контекст
 * @param expr - `TYPES` или `TYPES.map(...)`
 * @returns тип строкой или undefined, если это не константа
 */
/** `X.map(…)` → X; иначе само выражение. */
function mappedSource(expr: ts.Expression): ts.Expression {
  return ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'map' ? expr.expression.expression : expr;
}

/** Инициализатор константы без обёрток. */
function constInitOf(ctx: SourceContext, id: ts.Identifier): ts.Expression | undefined {
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  return decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined ? unwrap(decl.initializer) : undefined;
}

export function constValues(ctx: SourceContext, expr: ts.Expression | undefined): string | undefined {
  const id = expr === undefined ? undefined : mappedSource(expr);
  if (id === undefined || !ts.isIdentifier(id)) {
    return undefined;
  }
  const init = constInitOf(ctx, id);
  const values = init !== undefined && ts.isArrayLiteralExpression(init) ? init.elements.map((e) => literalText(e)) : [];
  return values.length > 0 && values.every((v) => v !== undefined) ? values.join(' | ') : `одно из ${id.text}`;
}