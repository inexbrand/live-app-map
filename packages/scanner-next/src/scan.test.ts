import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractEdgesFromSource,
  humanTitle,
  parseSegment,
  scanNextApp,
  segmentsToPattern,
} from './index';

describe('parseSegment', () => {
  test('group / dynamic / catch-all', () => {
    expect(parseSegment('(marketing)')).toEqual({ type: 'group', name: 'marketing' });
    expect(parseSegment('[id]')).toEqual({ type: 'dynamic', name: 'id' });
    expect(parseSegment('[...slug]')).toEqual({ type: 'catchAll', name: 'slug' });
  });
});

describe('segmentsToPattern', () => {
  test('strips groups', () => {
    const r = segmentsToPattern([
      { type: 'group', name: 'marketing' },
      { type: 'static', name: 'about' },
    ]);
    expect(r.pattern).toBe('/about');
    expect(r.groups).toEqual(['marketing']);
  });
});

describe('humanTitle', () => {
  test('корень — «Главная», сегменты без скобок', () => {
    expect(humanTitle('/')).toBe('Главная');
    expect(humanTitle('/about')).toBe('about');
    expect(humanTitle('/users/[id]')).toBe('users / id');
  });
});

describe('scanNextApp fixture', () => {
  test('discovers pages', async () => {
    const root = path.resolve(import.meta.dir, '../../../fixtures/next-app-router-basic');
    const result = await scanNextApp({
      projectRoot: root,
      baseUrl: 'http://localhost:3000',
      exampleParams: { id: 'demo' },
    });
    const pages = result.document.nodes.filter((n) => n.kind === 'page');
    const patterns = pages.map((p) => p.pathPattern).sort();
    expect(patterns).toContain('/');
    expect(patterns).toContain('/about');
    expect(patterns).toContain('/users/[id]');
    const home = pages.find((p) => p.pathPattern === '/');
    expect(home?.title).toBe('Главная');
    const user = pages.find((p) => p.pathPattern === '/users/[id]');
    expect(user?.pathExample).toBe('/users/demo');
    expect(user?.url).toBe('http://localhost:3000/users/demo');
  });

  test('App Router route-handler при includeRouteHandlers', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lam-next-rh-'));
    mkdirSync(path.join(root, 'app', 'api', 'health'), { recursive: true });
    writeFileSync(path.join(root, 'app', 'page.tsx'), 'export default function Home() { return null; }\n');
    writeFileSync(
      path.join(root, 'app', 'api', 'health', 'route.ts'),
      'export function GET() { return Response.json({ ok: true }); }\n',
    );

    const without = await scanNextApp({ projectRoot: root });
    expect(without.document.nodes.some((n) => n.kind === 'route-handler')).toBe(false);

    const withRh = await scanNextApp({
      projectRoot: root,
      includeRouteHandlers: true,
    });
    const handlers = withRh.document.nodes.filter((n) => n.kind === 'route-handler');
    expect(handlers.length).toBe(1);
    expect(handlers[0]?.pathPattern).toBe('/api/health');
    expect(handlers[0]?.id).toBe('route-handler:/api/health');
    expect(handlers[0]?.title).toBe('API /api/health');
  });

  test('Pages Router: page + api route-handler', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lam-next-pages-'));
    mkdirSync(path.join(root, 'pages', 'api'), { recursive: true });
    writeFileSync(path.join(root, 'pages', 'index.tsx'), 'export default function Home() { return null; }\n');
    writeFileSync(path.join(root, 'pages', 'about.tsx'), 'export default function About() { return null; }\n');
    writeFileSync(
      path.join(root, 'pages', 'api', 'hello.ts'),
      'export default function handler() { return null; }\n',
    );

    const result = await scanNextApp({
      projectRoot: root,
      baseUrl: 'http://localhost:3000',
      includeRouteHandlers: true,
    });
    const pages = result.document.nodes.filter((n) => n.kind === 'page');
    const handlers = result.document.nodes.filter((n) => n.kind === 'route-handler');
    const patterns = pages.map((p) => p.pathPattern).sort();
    expect(patterns).toContain('/');
    expect(patterns).toContain('/about');
    expect(pages.find((p) => p.pathPattern === '/')?.title).toBe('Главная');
    expect(pages.find((p) => p.pathPattern === '/')?.metadata).toEqual({ router: 'pages' });
    expect(handlers.some((h) => h.pathPattern === '/api/hello')).toBe(true);
    expect(result.document.project.next?.router).toBe('pages');
  });
});

describe('extractEdgesFromSource', () => {
  test('Link href и router.push → edges', () => {
    const source = `
      import Link from 'next/link';
      export default function Page() {
        return <Link href="/about">About</Link>;
      }
      function go(router) { router.push('/users/1'); }
    `;
    const routeIndex = new Map<string, string>([
      ['/about', 'route:/about'],
      ['/users/[id]', 'route:/users/[id]'],
    ]);
    const { edges, diagnostics } = extractEdgesFromSource(
      source,
      'app/page.tsx',
      'route:/',
      routeIndex,
    );
    const labels = edges.map((e) => e.label).sort();
    expect(labels).toContain('/about');
    expect(labels).toContain('/users/1');
    const about = edges.find((e) => e.label === '/about');
    expect(about?.to).toBe('route:/about');
    expect(about?.kind).toBe('link');
    expect(about?.confidence).toBe('high');
    const push = edges.find((e) => e.label === '/users/1');
    expect(push?.kind).toBe('push');
    expect(push?.to).toBe('route:/users/[id]');
    expect(diagnostics.filter((d) => d.code === 'UNRESOLVED_TARGET').length).toBe(0);
  });
});
