/**
 * Доступ к роуту через scanSource: сравнения роли, includes, 401, функции-проверки по глубине,
 * beforeHandle и хуки цепочки Elysia.
 */
import { expect, test } from 'bun:test';
import { scan } from './test/scan-project';

test('доступ каждого роута', () => {
  const code = scan({ 'src/a.ts': "import { Elysia } from 'elysia';\ndeclare const viewer: { role: string; name: string; roles: string[] };\ndeclare const list: string[];\ndeclare const set: { status: number };\ndeclare function requireAdminAccess(): void;\ndeclare function requirePermission(p: string): void;\ndeclare function requireRole(r: string): void;\ndeclare function ensureAccess(p: string): void;\ndeclare function requirePermissionPlugin(p: string): unknown;\ndeclare function requireAuth(): void;\ndeclare function formatUser(): void;\nasync function guardAdmin() { requirePermission('admin.read'); }\nfunction d1() { d2(); }\nfunction d2() { requireRole('x'); d3(); }\nfunction d3() { ensureAccess('deep.three'); d4(); }\nfunction d4() { ensureAccess('deep.four'); }\nexport const app = new Elysia()\n  .get('/eq', () => { if (viewer.role === 'admin') { return 1; } })\n  .get('/neq', () => { if (viewer.role !== 'owner') { return 1; } })\n  .get('/loose', () => { if (viewer.role == 'm') { return 1; } })\n  .get('/loose-neq', () => { if (viewer.role != 'n') { return 1; } })\n  .get('/lt', () => { if (viewer.role < 'x') { return 1; } })\n  .get('/left', () => { if ('lead' === viewer.role) { return 1; } })\n  .get('/name', () => { if (viewer.name === 'bob') { return 1; } })\n  .get('/includes', () => ['a', 'b', 1].includes(viewer.role))\n  .get('/includes-list', () => list.includes(viewer.role))\n  .get('/includes-other', () => ['x'].includes(viewer.name))\n  .get('/includes-none', () => ['x'].includes())\n  .get('/has', () => ['x'].has(viewer.role))\n  .get('/401', () => { set.status = 401; })\n  .get('/402', () => { set.status = 402; })\n  .get('/unauth', () => 'UNAUTHORIZED')\n  .get('/checks', () => { requireAdminAccess(); guardAdmin(); formatUser(); })\n  .get('/deep', () => { d1(); })\n  .get('/before', () => 1, { beforeHandle: () => requireAuth(), detail: () => requireRole('no') })\n  .get('/shorthand', () => 1, { beforeHandle });\ndeclare const beforeHandle: () => void;\nexport const chained = new Elysia()\n  .use(requirePermissionPlugin('plugin.use'))\n  .guard(requirePermissionPlugin('plugin.guard'))\n  .decorate(requirePermissionPlugin('plugin.decorate'))\n  .get('/chain', () => 1);\n" });
  expect(code.routes.map((r) => `${r.path} ${JSON.stringify(r.access ?? null)}`)).toEqual([
    "/eq {\"auth\":true,\"roles\":[\"admin\"]}",
    "/neq {\"auth\":true,\"roles\":[\"owner\"]}",
    "/loose {\"auth\":true,\"roles\":[\"m\"]}",
    "/loose-neq {\"auth\":true,\"roles\":[\"n\"]}",
    "/lt null",
    "/left {\"auth\":true,\"roles\":[\"lead\"]}",
    "/name null",
    "/includes {\"auth\":true,\"roles\":[\"a\",\"b\"]}",
    "/includes-list null",
    "/includes-other null",
    "/includes-none null",
    "/has null",
    "/401 {\"auth\":true}",
    "/402 null",
    "/unauth {\"auth\":true}",
    "/checks {\"auth\":true,\"permissions\":[\"admin.read\"],\"checks\":[\"guardAdmin\",\"requireAdminAccess\",\"requirePermission\"]}",
    "/deep {\"auth\":true,\"permissions\":[\"deep.three\"]}",
    "/before {\"auth\":true,\"checks\":[\"requireAuth\"]}",
    "/shorthand null",
    "/chain {\"auth\":true,\"permissions\":[\"plugin.guard\",\"plugin.use\"],\"checks\":[\"requirePermissionPlugin\"]}"
  ]);
});
