/**
 * Проверка входа роута: схемы body/query/params/headers из опций Elysia
 * (`{ body: t.Object(...) }`) и из `zValidator('json', z.object(...))` Hono.
 */
import ts from 'typescript';
import type { RouteFramework, RouteInput, RouteInputSchema } from '@live-app-map/schema';
import { type SourceContext } from './source-context';
import { describeSchema } from './schema-type';

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