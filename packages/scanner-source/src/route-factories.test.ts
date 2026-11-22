/**
 * Пути роутов из фабрик плагинов через scanSource: функция, стрелка, function-выражение,
 * повторные вызовы без дублей, неизвестный аргумент, env и динамические части пути.
 */
import { expect, test } from 'bun:test';
import { scan } from './test/scan-project';

test('пути роутов фабрик по местам их вызова', () => {
  const code = scan({ 'src/f.ts': "import { Elysia } from 'elysia';\ndeclare const id: string;\nexport function adminPlugin(opts: { basePath: string }) {\n  return new Elysia().get(opts.basePath, () => 1).get(`${opts.basePath}/:id`, () => 2);\n}\nexport const arrowPlugin = (base: string) => new Elysia().post(base + '/items', () => 1);\nexport const fnExpr = function (base: string) { return new Elysia().put(base, () => 1); };\nconst holder = { method(base: string) { return new Elysia().delete(base, () => 1); } };\nexport function unused(base: string) { return new Elysia().patch(base, () => 1); }\nexport function inner() { const make = (p: string) => new Elysia().get(p, () => 1); return make; }\nadminPlugin({ basePath: '/api/a' });\nadminPlugin({ basePath: '/api/b' });\nadminPlugin({ basePath: '/api/a' });\nadminPlugin({ basePath: id });\narrowPlugin('/api/arrow');\nfnExpr('/api/fe');\nholder.method('/api/m');\ninner()('/api/inner');\nexport const direct = new Elysia().get(`/api/env/${process.env.API_BASE}/x`, () => 1).get(`/api/dyn/${id}`, () => 1);\n" });
  expect(code.routes.map((r) => `${r.method} ${r.path}`)).toEqual([
    "GET /api/a/:id",
    "GET /api/b/:id",
    "GET /:id/:id",
    "GET /api/a",
    "GET /api/b",
    "POST /api/arrow/items",
    "PUT /api/fe",
    "GET /api/dyn/:id",
    "GET /api/env/x"
  ]);
});
