/**
 * Проверка входа роута: схемы body/query/params/headers из опций Elysia
 * (`{ body: t.Object(...) }`) и из `zValidator('json', z.object(...))` Hono.
 */
import ts from 'typescript';
import type { RouteFramework, RouteInput, RouteInputSchema, RouteSchemaField, RouteSchemaKind } from '@live-app-map/schema';
import { resolvedSymbol, type SourceContext } from './source-context';

/** Часть запроса. */
type Part = keyof RouteInput;

const ELYSIA_PARTS: readonly Part[] = ['body', 'query', 'params', 'headers'];

/** Ключ опций Elysia — часть запроса. */
function isPart(key: string | undefined): key is Part {
  return ELYSIA_PARTS.some((p) => p === key);
}
/** Цель валидатора Hono → часть запроса. */
const HONO_TARGETS: ReadonlyMap<string, Part> = new Map<string, Part>([
  ['json', 'body'],
  ['form', 'body'],
  ['query', 'query'],
  ['param', 'params'],
  ['header', 'headers'],
]);
const TEXT_MAX = 200;
/** Глубина раскрытия вложенных схем по имени. */
const MAX_DEPTH = 3;

/** Тип TypeBox по имени конструктора. */
const TYPEBOX_TYPES: ReadonlyMap<string, string> = new Map([
  ['String', 'string'],
  ['Number', 'number'],
  ['Integer', 'number'],
  ['Numeric', 'number'],
  ['Boolean', 'boolean'],
  ['BooleanString', 'boolean'],
  ['Date', 'date'],
  ['File', 'file'],
  ['Files', 'file[]'],
  ['Any', 'unknown'],
  ['Unknown', 'unknown'],
  ['Null', 'null'],
  ['Object', 'object'],
  ['Record', 'record'],
]);

/** Текст узла одной строкой до предела. */
function short(node: ts.Node): string {
  const t = node.getText().replace(/\s+/g, ' ').trim();
  return t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX - 1)}…` : t;
}

/** Вызов конструктора схемы: `t.String(...)` / `z.string()` — пространство и имя. */
type Ctor = { readonly ns: string; readonly name: string; readonly call: ts.CallExpression };

/**
 * Базовый конструктор цепочки zod или вызов TypeBox: `z.string().min(1).optional()` →
 * `z.string()`; методы цепочки после него.
 */
function baseCtor(expr: ts.Expression): { ctor?: Ctor; methods: string[] } {
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
function literalText(expr: ts.Expression | undefined): string | undefined {
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
function unwrap(expr: ts.Expression): ts.Expression {
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
function constValues(ctx: SourceContext, expr: ts.Expression | undefined): string | undefined {
  if (expr === undefined) {
    return undefined;
  }
  const id = ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'map'
    ? expr.expression.expression
    : expr;
  if (!ts.isIdentifier(id)) {
    return undefined;
  }
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  const init = decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined ? unwrap(decl.initializer) : undefined;
  const values = init !== undefined && ts.isArrayLiteralExpression(init) ? init.elements.map((e) => literalText(e)) : [];
  return values.length > 0 && values.every((v) => v !== undefined) ? values.join(' | ') : `одно из ${id.text}`;
}

/** Тип поля и признак необязательности. */
type FieldType = { readonly type: string; readonly optional: boolean };

/**
 * Тип выражения схемы.
 *
 * @param ctx - контекст
 * @param expr - выражение поля
 * @param depth - глубина раскрытия
 * @returns тип и необязательность
 */
function fieldType(ctx: SourceContext, expr: ts.Expression, depth: number): FieldType {
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
    return { type: ts.isIdentifier(expr) ? expr.text : expr.name.text, optional: false };
  }
  const { ctor, methods } = baseCtor(expr);
  if (ctor === undefined) {
    return { type: short(expr), optional: false };
  }
  const zodOptional = methods.some((m) => m === 'optional' || m === 'nullish');
  const args = ctor.call.arguments;
  const inner = (e: ts.Expression | undefined): string => (e === undefined ? 'unknown' : fieldType(ctx, e, depth + 1).type);
  const union = (e: ts.Expression | undefined): string =>
    e !== undefined && ts.isArrayLiteralExpression(e)
      ? e.elements.map((x) => literalText(x) ?? inner(x)).join(' | ')
      : (constValues(ctx, e) ?? inner(e));
  if (ctor.ns === 't') {
    switch (ctor.name) {
      case 'Optional':
        return { type: inner(args[0]), optional: true };
      case 'Nullable':
        return { type: `${inner(args[0])} | null`, optional: false };
      case 'Array':
        return { type: `${inner(args[0])}[]`, optional: false };
      case 'Literal':
        return { type: literalText(args[0]) ?? 'literal', optional: false };
      case 'Union':
        return { type: union(args[0]), optional: false };
      default:
        return { type: TYPEBOX_TYPES.get(ctor.name) ?? ctor.name.toLowerCase(), optional: false };
    }
  }
  const zodType = (): string => {
    switch (ctor.name) {
      case 'array':
        return `${inner(args[0])}[]`;
      case 'enum':
      case 'union':
        return union(args[0]);
      case 'literal':
        return literalText(args[0]) ?? 'literal';
      case 'nativeEnum':
        return inner(args[0]);
      default:
        return ctor.name;
    }
  };
  return { type: zodType(), optional: zodOptional };
}

/** Поля объектной схемы. */
function objectFields(ctx: SourceContext, obj: ts.ObjectLiteralExpression, depth: number): RouteSchemaField[] {
  return obj.properties.flatMap((p) => {
    if (!ts.isPropertyAssignment(p)) {
      return [];
    }
    const t = fieldType(ctx, p.initializer, depth);
    return [{ name: p.name.getText().replace(/^['"]|['"]$/g, ''), type: t.type, ...(t.optional ? { optional: true } : {}) }];
  });
}

/**
 * Схема одной части входа.
 *
 * @param ctx - контекст
 * @param expr - выражение схемы
 * @param fallback - вид схемы, если по выражению не понять
 * @param depth - глубина раскрытия константы
 * @returns схема
 */
function describeSchema(ctx: SourceContext, expr: ts.Expression, fallback: RouteSchemaKind, depth = 0): RouteInputSchema {
  if (ts.isIdentifier(expr) && depth < MAX_DEPTH) {
    const decl = resolvedSymbol(ctx.checker, expr)?.valueDeclaration;
    if (decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined) {
      return { ...describeSchema(ctx, decl.initializer, fallback, depth + 1), name: expr.text };
    }
    return { kind: fallback, name: expr.text, fields: [] };
  }
  const { ctor } = baseCtor(expr);
  const kind: RouteSchemaKind = ctor === undefined ? fallback : ctor.ns === 'z' ? 'zod' : 'typebox';
  const arg = ctor?.call.arguments[0];
  if (ctor !== undefined && (ctor.name === 'Object' || ctor.name === 'object') && arg !== undefined && ts.isObjectLiteralExpression(arg)) {
    return { kind, fields: objectFields(ctx, arg, depth) };
  }
  return { kind, fields: [], text: short(expr) };
}

/** Схемы из объекта опций Elysia. */
function elysiaInput(ctx: SourceContext, call: ts.CallExpression): Partial<Record<Part, RouteInputSchema>> {
  const out: Partial<Record<Part, RouteInputSchema>> = {};
  for (const arg of call.arguments.slice(1)) {
    if (!ts.isObjectLiteralExpression(arg)) {
      continue;
    }
    for (const p of arg.properties) {
      const key = p.name?.getText();
      if (ts.isPropertyAssignment(p) && isPart(key)) {
        out[key] = describeSchema(ctx, p.initializer, 'typebox');
      }
    }
  }
  return out;
}

/** Схемы из middleware-валидаторов Hono: `zValidator('json', schema)`. */
function honoInput(ctx: SourceContext, call: ts.CallExpression): Partial<Record<Part, RouteInputSchema>> {
  const out: Partial<Record<Part, RouteInputSchema>> = {};
  for (const arg of call.arguments.slice(1)) {
    if (!ts.isCallExpression(arg) || !/validator$/i.test(arg.expression.getText())) {
      continue;
    }
    const [target, schema] = arg.arguments;
    const part = target !== undefined && ts.isStringLiteral(target) ? HONO_TARGETS.get(target.text) : undefined;
    if (part !== undefined && schema !== undefined) {
      out[part] = describeSchema(ctx, schema, 'zod');
    }
  }
  return out;
}

/**
 * Проверка входа роута по его вызову.
 *
 * @param ctx - контекст
 * @param call - вызов `.get(path, handler, options)`
 * @param framework - фреймворк роута
 * @returns схемы частей запроса или undefined, если проверки нет
 */
export function routeInput(ctx: SourceContext, call: ts.CallExpression, framework: RouteFramework): RouteInput | undefined {
  const found = framework === 'elysia' ? elysiaInput(ctx, call) : framework === 'hono' ? honoInput(ctx, call) : {};
  return Object.keys(found).length === 0 ? undefined : found;
}
