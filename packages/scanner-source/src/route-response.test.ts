/**
 * Ответ обработчика через scanSource: поля объекта, значения, статусы Elysia, Hono и Express.
 */
import { expect, test } from 'bun:test';
import { scan } from './test/scan-project';

test('ответ каждого роута', () => {
  const code = scan({ 'src/r.ts': "import { Elysia } from 'elysia';\ndeclare const repo: { find(): unknown };\ndeclare const deep: { a: { b(): unknown } };\ndeclare const user: unknown;\ndeclare function load(): unknown;\ndeclare function status(code: number, body?: unknown): unknown;\ndeclare function error(code: number): unknown;\nconst key = 'k';\nconst many = () => ({ a1: 1, a2: 2, a3: 3, a4: 4, a5: 5, a6: 6, a7: 7, a8: 8, a9: 9, a10: 10, a11: 11, a12: 12, a13: 13 });\nexport const app = new Elysia()\n  .get('/obj', () => ({ id: 1, 'quoted': 2, [key]: 3, ...user, method() { return 1; } }))\n  .get('/await', async () => (await load()) as unknown)\n  .get('/sat', () => ({ x: 1 }) satisfies object)\n  .get('/ident', () => { return user; })\n  .get('/call', () => repo.find())\n  .get('/deep', () => deep.a.b())\n  .get('/fn', () => load())\n  .get('/status', () => status(404, { message: 'no' }))\n  .get('/status-only', () => status(201))\n  .get('/error', () => { return error(403); })\n  .get('/set', ({ set }) => { set.status = 418; return 'x'; })\n  .get('/set-plus', ({ set }) => { set.status += 1; })\n  .get('/nested', () => { const f = () => ({ inner: 1 }); return f; })\n  .get('/many', many)\n  .get('/statuses', () => { status(500); status(200); status(404); status(301); return; })\n  .get('/fnexpr', function () { return { fe: 1 }; })\n  .get('/empty', () => {});\ndeclare const c: { json(b: unknown, s?: number): unknown; text(t: string): unknown };\ndeclare const res: { json(b: unknown): unknown; send(b?: unknown): unknown; sendStatus(n: number): unknown; status(n: number): typeof res };\nexport const hono = new Elysia()\n  .post('/hono', () => c.json({ ok: true }, 201))\n  .post('/hono-text', () => c.text('x'))\n  .post('/express', () => { res.status(400).json({ err: 1 }); })\n  .post('/express2', () => { res.sendStatus(204); })\n  .post('/send-empty', () => { res.send(); })\n  .post('/send-paren', () => { (res.json({ par: 1 })); });\n" });
  expect(code.routes.map((r) => `${r.method} ${r.path} ${JSON.stringify(r.response ?? null)}`)).toEqual([
    "GET /obj {\"fields\":[\"id\",\"quoted\",\"...user\",\"method\"]}",
    "GET /await {\"values\":[\"load()\"]}",
    "GET /sat {\"fields\":[\"x\"]}",
    "GET /ident {\"values\":[\"user\"]}",
    "GET /call {\"values\":[\"repo.find()\"]}",
    "GET /deep null",
    "GET /fn {\"values\":[\"load()\"]}",
    "GET /status {\"fields\":[\"message\"],\"statuses\":[404]}",
    "GET /status-only {\"statuses\":[201]}",
    "GET /error {\"statuses\":[403]}",
    "GET /set {\"statuses\":[418]}",
    "GET /set-plus null",
    "GET /nested {\"values\":[\"f\"]}",
    "GET /many {\"fields\":[\"a1\",\"a2\",\"a3\",\"a4\",\"a5\",\"a6\",\"a7\",\"a8\",\"a9\",\"a10\",\"a11\",\"a12\"]}",
    "GET /statuses {\"statuses\":[200,301,404,500]}",
    "GET /fnexpr {\"fields\":[\"fe\"]}",
    "GET /empty null",
    "POST /hono {\"fields\":[\"ok\"],\"statuses\":[201]}",
    "POST /hono-text {\"values\":[\"c.text()\"]}",
    "POST /express {\"fields\":[\"err\"],\"statuses\":[400]}",
    "POST /express2 {\"statuses\":[204]}",
    "POST /send-empty {\"values\":[\"res.send()\"]}",
    "POST /send-paren {\"fields\":[\"par\"]}"
  ]);
});
