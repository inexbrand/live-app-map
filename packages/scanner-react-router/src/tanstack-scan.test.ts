/**
 * Скан TanStack Router через scanReactRouterApp: экраны, адреса, переходы и их уверенность.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanReactRouterApp } from './index';

const root = mkdtempSync(path.join(tmpdir(), 'lam-tanstack-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

put(
  'src/router.tsx',
  [
    "import { createRootRoute, createRoute, redirect } from '@tanstack/react-router';",
    "import { Home } from './Home';",
    "import { Client } from './Client';",
    'const rootRoute = createRootRoute({});',
    "const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });",
    "const clientRoute = createRoute({ getParentRoute: () => rootRoute, path: 'clients/$clientId', component: Client });",
    "const oldRoute = createRoute({ getParentRoute: () => rootRoute, path: 'old', beforeLoad: () => { throw redirect({ to: '/' }); } });",
  ].join('\n'),
);
put('src/Home.tsx', "import { Widget } from './Widget';\nexport function Home() { return <Link to=\"/clients/$clientId\">к клиенту</Link>; }");
put('src/Client.tsx', "import { Widget } from './Widget';\nexport function Client() { return null; }");
put('src/Widget.tsx', 'export function Widget() { return <Link to="/old/">старое</Link>; }');
put('src/Home.test.tsx', 'import "@tanstack/react-router"; createRoute({ path: "nope" })');

describe('scanReactRouterApp: TanStack Router', () => {
  test('экраны с адресами и пропущенным примером параметра', async () => {
    const r = await scanReactRouterApp({ projectRoot: root, baseUrl: 'http://h' });
    expect(r.document.nodes.map((n) => [n.id, n.pathExample, n.url, n.source?.file])).toEqual([
      ['route:/', '/', 'http://h/', 'src/Home.tsx'],
      ['route:/clients/[clientId]', '/clients/example', 'http://h/clients/example', 'src/Client.tsx'],
      ['route:/old', '/old', 'http://h/old', 'src/router.tsx'],
    ]);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['MISSING_EXAMPLE_PARAM', 'SCAN_OK']);
  });

  test('переходы: redirect — high, из своего файла — medium, из общего виджета — low', async () => {
    const r = await scanReactRouterApp({ projectRoot: root, baseUrl: null });
    expect(r.document.nodes.every((n) => n.url === undefined)).toBe(true);
    expect(r.document.edges.map((e) => [e.from, e.to, e.kind, e.confidence])).toEqual([
      ['route:/', 'route:/clients/[clientId]', 'link', 'medium'],
      ['route:/', 'route:/old', 'link', 'low'],
      ['route:/clients/[clientId]', 'route:/old', 'link', 'low'],
      ['route:/old', 'route:/', 'redirect', 'high'],
    ]);
  });
});
