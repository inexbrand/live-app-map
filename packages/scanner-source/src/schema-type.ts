/**
 * Описание схемы TypeBox / Zod: поля, типы, правила, вложенность.
 */
import ts from 'typescript';
import type { RouteInputSchema, RouteSchemaField, RouteSchemaKind } from '@live-app-map/schema';
import { resolvedSymbol, type SourceContext } from './source-context';
import { baseCtor, constValues, literalText, MAX_DEPTH, short, unwrap, type Ctor } from './schema-ast';

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
  const id = ts.isIdentifier(expr) ? expr : expr.name;
  const init = depth < MAX_DEPTH ? schemaConst(ctx, id) : undefined;
  if (init === undefined) {
    return { type: id.text, optional: false };
  }
  const name = id.text;
  const resolved = fieldType(ctx, init, depth + 1);
  return resolved.fields === undefined || resolved.type !== 'object' ? resolved : { ...resolved, type: name };
}

/** Инициализатор константы-схемы (без обёрток). */
function schemaConst(ctx: SourceContext, id: ts.Node): ts.Expression | undefined {
  const decl = resolvedSymbol(ctx.checker, id)?.valueDeclaration;
  return decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined ? unwrap(decl.initializer) : undefined;
}

/** Поля, слитые из нескольких объектов: `t.Intersect([A, B])`, `t.Composite([A, B])`. */
function mergedObjects(ctx: SourceContext, list: ts.Expression | undefined, depth: number): FieldType {
  const parts = list !== undefined && ts.isArrayLiteralExpression(list) ? list.elements.map((e) => fieldType(ctx, e, depth + 1)) : [];
  return objectType(parts.flatMap((p) => p.fields ?? []));
}

/** Аргументы конструктора и разбор вложенного выражения. */
type CtorArgs = {
  readonly ctx: SourceContext;
  readonly args: ts.NodeArray<ts.Expression>;
  readonly depth: number;
  /** Тип вложенного выражения (нет выражения — unknown). */
  readonly inner: (e: ts.Expression | undefined) => FieldType;
};

/** Поля объекта из первого аргумента-литерала. */
function literalObject(a: CtorArgs): FieldType {
  const first = a.args[0];
  return objectType(first !== undefined && ts.isObjectLiteralExpression(first) ? objectFields(a.ctx, first, a.depth + 1) : []);
}

/** Литерал: `t.Literal('a')`, `z.literal('a')`. */
function literalType(a: CtorArgs): FieldType {
  return { type: literalText(a.args[0]) ?? 'literal', optional: false };
}

/** Союз: `t.Union([...])`, `z.enum([...])`. */
function unionType(a: CtorArgs): FieldType {
  return { type: unionText(a.ctx, a.args[0], a.depth), optional: false };
}

/** Конструкторы TypeBox, кроме простых типов (они — в TYPEBOX_TYPES). */
const TYPEBOX_CTORS: ReadonlyMap<string, (a: CtorArgs) => FieldType> = new Map<string, (a: CtorArgs) => FieldType>([
  ['Optional', (a) => ({ ...a.inner(a.args[0]), optional: true })],
  ['Nullable', (a) => {
    const t = a.inner(a.args[0]);
    return { ...t, type: `${t.type} | null` };
  }],
  ['Array', (a) => withRules(arrayOf(a.inner(a.args[0])), typeboxRules(a.args[1]))],
  ['Literal', literalType],
  ['Union', unionType],
  ['Object', literalObject],
  ['Partial', (a) => {
    const t = a.inner(a.args[0]);
    return { ...t, ...(t.fields === undefined ? {} : { fields: allOptional(t.fields) }) };
  }],
  ['Intersect', (a) => mergedObjects(a.ctx, a.args[0], a.depth)],
  ['Composite', (a) => mergedObjects(a.ctx, a.args[0], a.depth)],
  ['Record', (a) => ({ type: `record<${a.inner(a.args[0]).type}, ${a.inner(a.args[1]).type}>`, optional: false })],
]);

/** Конструкторы zod, кроме простых (их тип — имя конструктора). */
const ZOD_CTORS: ReadonlyMap<string, (a: CtorArgs) => FieldType> = new Map<string, (a: CtorArgs) => FieldType>([
  ['array', (a) => arrayOf(a.inner(a.args[0]))],
  ['enum', unionType],
  ['union', unionType],
  ['literal', literalType],
  ['nativeEnum', (a) => a.inner(a.args[0])],
  ['object', literalObject],
  ['record', (a) => ({ type: `record<string, ${a.inner(a.args[a.args.length - 1]).type}>`, optional: false })],
]);

/** Аргументы вызова конструктора для таблиц. */
function ctorArgs(ctx: SourceContext, ctor: Ctor, depth: number): CtorArgs {
  return {
    ctx,
    args: ctor.call.arguments,
    depth,
    inner: (e) => (e === undefined ? { type: 'unknown', optional: false } : fieldType(ctx, e, depth + 1)),
  };
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
  const build = TYPEBOX_CTORS.get(ctor.name);
  if (build !== undefined) {
    return build(ctorArgs(ctx, ctor, depth));
  }
  return withRules({ type: TYPEBOX_TYPES.get(ctor.name) ?? ctor.name.toLowerCase(), optional: false }, typeboxRules(ctor.call.arguments[0]));
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
  const build = ZOD_CTORS.get(ctor.name);
  const base = build === undefined ? { type: ctor.name, optional: false } : build(ctorArgs(ctx, ctor, depth));
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
export function describeSchema(ctx: SourceContext, expr: ts.Expression, fallback: RouteSchemaKind): RouteInputSchema {
  const named = ts.isIdentifier(expr) ? expr.text : undefined;
  const t = fieldType(ctx, expr, 0);
  const kind = ts.isIdentifier(expr) ? schemaKindOf(ctx, expr, fallback) : kindOfExpr(expr, fallback);
  const base = { kind, ...(named === undefined ? {} : { name: named }), ...(t.optional ? { optional: true } : {}) };
  if (t.fields !== undefined) {
    // Объект без полей — «{}»: тело есть, данных в нём нет.
    return t.fields.length > 0 ? { ...base, fields: t.fields } : { ...base, fields: [], type: '{}' };
  }
  const opaque = t.type === named || t.type === short(expr);
  return opaque ? { ...base, fields: [], text: short(expr) } : { ...base, fields: [], type: t.type };
}

/** Вид схемы константы по её инициализатору. */
function schemaKindOf(ctx: SourceContext, id: ts.Identifier, fallback: RouteSchemaKind): RouteSchemaKind {
  const init = schemaConst(ctx, id);
  return init === undefined ? fallback : kindOfExpr(init, fallback);
}

/** Вид схемы по базовому конструктору: `z.*` — zod, иначе typebox; не схема — fallback. */
function kindOfExpr(expr: ts.Expression, fallback: RouteSchemaKind): RouteSchemaKind {
  const { ctor } = baseCtor(expr);
  if (ctor === undefined) {
    return fallback;
  }
  return ctor.ns === 'z' ? 'zod' : 'typebox';
}
