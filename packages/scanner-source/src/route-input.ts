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
/** Глубина вложенности схем, до которой константы раскрываются (защита от циклов). */
const MAX_DEPTH = 8;

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

/** Тип выражения схемы: текст, необязательность, правила, вложенные поля. */
type FieldType = {
  readonly type: string;
  readonly optional: boolean;
  readonly rules?: readonly string[];
  readonly fields?: readonly RouteSchemaField[];
};

/** Ключи опций TypeBox, которые показываются как правила. */
const TYPEBOX_RULES = new Set([
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'default',
  'multipleOf',
  'uniqueItems',
]);

/** Методы цепочки zod, которые меняют не правила, а необязательность или вид. */
const ZOD_SHAPE_METHODS = new Set(['optional', 'nullish', 'nullable', 'partial', 'describe', 'openapi', 'strict', 'passthrough']);

/** Значение опции строкой: литерал или текст выражения. */
function optionValue(expr: ts.Expression): string {
  const lit = literalText(expr);
  return lit === undefined ? short(expr) : lit.replace(/^'(.*)'$/, '$1');
}

/** Правила из объекта опций TypeBox: `{ minLength: 1, format: 'uuid' }` → `minLength 1`, `format uuid`. */
function typeboxRules(options: ts.Expression | undefined): string[] {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return [];
  }
  return options.properties.flatMap((p) => {
    const key = ts.isPropertyAssignment(p) ? p.name.getText() : '';
    return ts.isPropertyAssignment(p) && TYPEBOX_RULES.has(key) ? [`${key} ${optionValue(p.initializer)}`] : [];
  });
}

/** Правила из цепочки zod: `.min(1).max(9).email()` → `min 1`, `max 9`, `email`. */
function zodRules(call: ts.CallExpression, methods: readonly string[]): string[] {
  const out: string[] = [];
  let cur: ts.Node = call.parent;
  for (const m of methods) {
    const owner = ts.isPropertyAccessExpression(cur) ? cur.parent : undefined;
    const arg = owner !== undefined && ts.isCallExpression(owner) ? owner.arguments[0] : undefined;
    if (!ZOD_SHAPE_METHODS.has(m)) {
      out.push(arg === undefined ? m : `${m} ${optionValue(arg)}`);
    }
    cur = owner?.parent ?? cur;
  }
  return out;
}

/** Тип с правилами, если они есть. */
function withRules(t: FieldType, rules: readonly string[]): FieldType {
  return rules.length === 0 ? t : { ...t, rules: [...(t.rules ?? []), ...rules] };
}

/** Все поля необязательные (`t.Partial`, `.partial()`). */
function allOptional(fields: readonly RouteSchemaField[] | undefined): RouteSchemaField[] | undefined {
  return fields?.map((f) => ({ ...f, optional: true }));
}

/** Объектный тип с полями. */
function objectType(fields: readonly RouteSchemaField[]): FieldType {
  return { type: 'object', optional: false, fields };
}

/** Массив: тип элемента с `[]`, поля элемента-объекта переходят к массиву. */
function arrayOf(item: FieldType): FieldType {
  const type = item.type.includes(' | ') ? `(${item.type})[]` : `${item.type}[]`;
  return { type, optional: false, ...(item.fields === undefined ? {} : { fields: item.fields }) };
}

/**
 * Константа-схема по имени: `AudienceFilter` → её тип; объект подписывается именем константы.
 *
 * @param ctx - контекст
 * @param expr - имя или `ns.Name`
 * @param depth - глубина раскрытия
 * @returns тип
 */
function namedType(ctx: SourceContext, expr: ts.Identifier | ts.PropertyAccessExpression, depth: number): FieldType {
  const name = ts.isIdentifier(expr) ? expr.text : expr.name.text;
  const id = ts.isIdentifier(expr) ? expr : expr.name;
  const decl = depth < MAX_DEPTH ? resolvedSymbol(ctx.checker, id)?.valueDeclaration : undefined;
  if (decl === undefined || !ts.isVariableDeclaration(decl) || decl.initializer === undefined) {
    return { type: name, optional: false };
  }
  const resolved = fieldType(ctx, unwrap(decl.initializer), depth + 1);
  return resolved.fields === undefined || resolved.type !== 'object' ? resolved : { ...resolved, type: name };
}

/** Поля, слитые из нескольких объектов: `t.Intersect([A, B])`, `t.Composite([A, B])`. */
function mergedObjects(ctx: SourceContext, list: ts.Expression | undefined, depth: number): FieldType {
  const parts = list !== undefined && ts.isArrayLiteralExpression(list) ? list.elements.map((e) => fieldType(ctx, e, depth + 1)) : [];
  return objectType(parts.flatMap((p) => p.fields ?? []));
}

/**
 * Тип конструктора TypeBox `t.*`.
 *
 * @param ctx - контекст
 * @param ctor - вызов
 * @param depth - глубина
 * @returns тип
 */
function typeboxType(ctx: SourceContext, ctor: Ctor, depth: number): FieldType {
  const args = ctor.call.arguments;
  const inner = (e: ts.Expression | undefined): FieldType => (e === undefined ? { type: 'unknown', optional: false } : fieldType(ctx, e, depth + 1));
  switch (ctor.name) {
    case 'Optional':
      return { ...inner(args[0]), optional: true };
    case 'Nullable': {
      const t = inner(args[0]);
      return { ...t, type: `${t.type} | null` };
    }
    case 'Array':
      return withRules(arrayOf(inner(args[0])), typeboxRules(args[1]));
    case 'Literal':
      return { type: literalText(args[0]) ?? 'literal', optional: false };
    case 'Union':
      return { type: unionText(ctx, args[0], depth), optional: false };
    case 'Object':
      return withRules(objectType(args[0] !== undefined && ts.isObjectLiteralExpression(args[0]) ? objectFields(ctx, args[0], depth + 1) : []), []);
    case 'Partial': {
      const t = inner(args[0]);
      return { ...t, ...(t.fields === undefined ? {} : { fields: allOptional(t.fields) }) };
    }
    case 'Intersect':
    case 'Composite':
      return mergedObjects(ctx, args[0], depth);
    case 'Record':
      return { type: `record<${inner(args[0]).type}, ${inner(args[1]).type}>`, optional: false };
    default:
      return withRules({ type: TYPEBOX_TYPES.get(ctor.name) ?? ctor.name.toLowerCase(), optional: false }, typeboxRules(args[0]));
  }
}

/** Союз: массив вариантов или константа-массив. */
function unionText(ctx: SourceContext, e: ts.Expression | undefined, depth: number): string {
  return e !== undefined && ts.isArrayLiteralExpression(e)
    ? e.elements.map((x) => literalText(x) ?? fieldType(ctx, x, depth + 1).type).join(' | ')
    : (constValues(ctx, e) ?? (e === undefined ? 'unknown' : fieldType(ctx, e, depth + 1).type));
}

/**
 * Тип конструктора zod `z.*` с цепочкой методов.
 *
 * @param ctx - контекст
 * @param ctor - базовый вызов
 * @param methods - методы цепочки после него
 * @param depth - глубина
 * @returns тип
 */
function zodType(ctx: SourceContext, ctor: Ctor, methods: readonly string[], depth: number): FieldType {
  const args = ctor.call.arguments;
  const inner = (e: ts.Expression | undefined): FieldType => (e === undefined ? { type: 'unknown', optional: false } : fieldType(ctx, e, depth + 1));
  const base = ((): FieldType => {
    switch (ctor.name) {
      case 'array':
        return arrayOf(inner(args[0]));
      case 'enum':
      case 'union':
        return { type: unionText(ctx, args[0], depth), optional: false };
      case 'literal':
        return { type: literalText(args[0]) ?? 'literal', optional: false };
      case 'nativeEnum':
        return inner(args[0]);
      case 'object':
        return objectType(args[0] !== undefined && ts.isObjectLiteralExpression(args[0]) ? objectFields(ctx, args[0], depth + 1) : []);
      case 'record':
        return { type: `record<string, ${inner(args[args.length - 1]).type}>`, optional: false };
      default:
        return { type: ctor.name, optional: false };
    }
  })();
  const partial = methods.includes('partial') && base.fields !== undefined ? { fields: allOptional(base.fields) } : {};
  const optional = methods.some((m) => m === 'optional' || m === 'nullish');
  return withRules({ ...base, ...partial, optional }, zodRules(ctor.call, methods));
}

/**
 * Тип выражения схемы.
 *
 * @param ctx - контекст
 * @param expr - выражение поля
 * @param depth - глубина раскрытия
 * @returns тип, необязательность, правила, вложенные поля
 */
function fieldType(ctx: SourceContext, expr: ts.Expression, depth: number): FieldType {
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
    return namedType(ctx, expr, depth);
  }
  const { ctor, methods } = baseCtor(expr);
  if (ctor === undefined) {
    return { type: short(expr), optional: false };
  }
  return ctor.ns === 't' ? typeboxType(ctx, ctor, depth) : zodType(ctx, ctor, methods, depth);
}

/** Поля объектной схемы. */
function objectFields(ctx: SourceContext, obj: ts.ObjectLiteralExpression, depth: number): RouteSchemaField[] {
  return obj.properties.flatMap((p) => {
    if (!ts.isPropertyAssignment(p)) {
      return [];
    }
    const t = fieldType(ctx, p.initializer, depth);
    return [
      {
        name: p.name.getText().replace(/^['"]|['"]$/g, ''),
        type: t.type,
        ...(t.optional ? { optional: true } : {}),
        ...(t.rules === undefined || t.rules.length === 0 ? {} : { rules: t.rules }),
        ...(t.fields === undefined || t.fields.length === 0 ? {} : { fields: t.fields }),
      },
    ];
  });
}

/**
 * Схема одной части входа.
 *
 * @param ctx - контекст
 * @param expr - выражение схемы
 * @param fallback - вид схемы, если по выражению не понять
 * @returns схема: поля объекта или тип части; текст — только если не разобрано ничего
 */
function describeSchema(ctx: SourceContext, expr: ts.Expression, fallback: RouteSchemaKind): RouteInputSchema {
  const named = ts.isIdentifier(expr) ? expr.text : undefined;
  const { ctor } = baseCtor(expr);
  const kind: RouteSchemaKind = ctor === undefined ? fallback : ctor.ns === 'z' ? 'zod' : 'typebox';
  const t = fieldType(ctx, expr, 0);
  const resolvedKind = ts.isIdentifier(expr) ? schemaKindOf(ctx, expr, fallback) : kind;
  const base = { kind: resolvedKind, ...(named === undefined ? {} : { name: named }), ...(t.optional ? { optional: true } : {}) };
  if (t.fields !== undefined) {
    return { ...base, fields: t.fields };
  }
  const opaque = t.type === named || t.type === short(expr);
  return opaque ? { ...base, fields: [], text: short(expr) } : { ...base, fields: [], type: t.type };
}

/** Вид схемы константы по её инициализатору. */
function schemaKindOf(ctx: SourceContext, id: ts.Identifier, fallback: RouteSchemaKind): RouteSchemaKind {
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  const init = decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined ? unwrap(decl.initializer) : undefined;
  const ctor = init === undefined ? undefined : baseCtor(init).ctor;
  return ctor === undefined ? fallback : ctor.ns === 'z' ? 'zod' : 'typebox';
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
