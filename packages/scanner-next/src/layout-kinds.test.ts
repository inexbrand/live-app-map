/**
 * Редкие виды файлов Next: перехват, слоты, группы, not-found, служебные файлы, pages/api, hybrid.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSegment, scanNextApp, segmentsToPattern } from './index';
import { buildWrapsEdges } from './edges';

const root = mkdtempSync(path.join(tmpdir(), 'lam-next-kinds-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text = 'export default function P() { return null; }'): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

put('app/layout.tsx');
put('app/page.tsx', 'import Link from "next/link"; <Link href="/shop/42?x=1">a</Link>; router.replace("/docs/a/b"); redirect("//cdn"); redirect("/nowhere");');
put('app/(marketing)/about/page.tsx');
put('app/shop/layout.tsx');
put('app/shop/[id]/page.tsx');
put('app/shop/loading.tsx');
put('app/shop/error.tsx');
put('app/docs/[[...slug]]/page.tsx');
put('app/@modal/(.)photo/[id]/page.tsx');
put('app/not-found.tsx');
put('app/api/ping/route.ts');
put('pages/index.tsx');
put('pages/legacy/[slug].tsx');
put('pages/_app.tsx');
put('pages/api/hello.ts');
put('pages/readme.md');

describe('scanNextApp: виды файлов', () => {
  test('ноды, id, виды и пути', async () => {
    const r = await scanNextApp({ projectRoot: root, baseUrl: 'http://h', includeRouteHandlers: true, exampleParams: { id: '7' } });
    const nodes = r.document.nodes.map((n) => [n.id, n.kind, n.pathExample ?? null, n.url ?? null, n.groupIds ?? null, n.tags ?? null]);
    // Порядок: сначала pages/ (обход по имени), затем макеты app/, затем экраны app/.
    expect(nodes).toEqual([
      ['route-handler:/api/hello', 'route-handler', '/api/hello', null, null, null],
      ['route:/', 'page', '/', 'http://h/', null, null],
      ['route:/legacy/[slug]', 'page', '/legacy/example', 'http://h/legacy/example', null, null],
      ['layout:/', 'layout', null, null, null, null],
      ['layout:/shop', 'layout', null, null, null, null],
      ['route:/about', 'page', '/about', 'http://h/about', ['marketing'], null],
      ['intercept:/photo/[id]', 'intercept', '/photo/7', 'http://h/photo/7', null, ['slot:modal']],
      ['route-handler:/api/ping', 'route-handler', null, null, null, ['api']],
      ['route:/docs/[[...slug]]', 'page', '/docs', 'http://h/docs', null, null],
      ['not-found:/', 'not-found', '/', 'http://h/', null, null],
      ['route:/shop/[id]', 'page', '/shop/7', 'http://h/shop/7', null, null],
    ]);
    expect(r.document.project.next?.router).toBe('hybrid');
    expect(r.document.project.framework).toBe('hybrid');
    expect(r.document.groups?.map((g) => g.id)).toEqual(['marketing']);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['MISSING_EXAMPLE_PARAM', 'HYBRID_ROUTER', 'UNRESOLVED_TARGET', 'SCAN_OK']);
  });

  test('переходы: query отрезан, catch-all, протокол-относительный пропущен, нет цели — medium', async () => {
    const r = await scanNextApp({ projectRoot: root, exampleParams: { id: '7' } });
    const fromHome = r.document.edges.filter((e) => e.from === 'route:/' && e.kind !== 'wraps').map((e) => [e.kind, e.to, e.label, e.confidence]);
    expect(fromHome).toEqual([
      ['link', 'route:/shop/[id]', '/shop/42', 'high'],
      ['replace', 'route:/docs/[[...slug]]', '/docs/a/b', 'high'],
      ['redirect', null, '/nowhere', 'medium'],
    ]);
    const wraps = r.document.edges.filter((e) => e.kind === 'wraps').map((e) => `${e.from}>${e.to}`);
    expect(wraps).toContain('layout:/shop>route:/shop/[id]');
    expect(wraps).toContain('layout:/>route:/about');
    expect(r.document.nodes.some((n) => n.kind === 'route-handler')).toBe(false);
  });

  test('пустой каталог — NO_APP_DIR и NO_ROUTES_FOUND', async () => {
    const r = await scanNextApp({ projectRoot: path.join(root, 'нет') });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['NO_APP_DIR', 'NO_ROUTES_FOUND']);
  });
});

describe('сегменты', () => {
  test('parseSegment: все виды', () => {
    expect(['@slot', '(.)a', '(..)(..)b', '(...)c', '(..)d', '(g)', '[[...o]]', '[...c]', '[d]', 's'].map(parseSegment)).toEqual([
      { type: 'parallel', name: 'slot' },
      { type: 'intercept', name: 'a', mode: '(.)' },
      { type: 'intercept', name: 'b', mode: '(..)(..)' },
      { type: 'intercept', name: 'c', mode: '(...)' },
      { type: 'intercept', name: 'd', mode: '(..)' },
      { type: 'group', name: 'g' },
      { type: 'optionalCatchAll', name: 'o' },
      { type: 'catchAll', name: 'c' },
      { type: 'dynamic', name: 'd' },
      { type: 'static', name: 's' },
    ]);
  });

  test('segmentsToPattern: последний слот и перехват, группы вне пути', () => {
    const r = segmentsToPattern(['(g)', '@a', '@b', '(..)x', '[...rest]'].map(parseSegment));
    expect(r).toEqual({ pattern: '/x/[...rest]', groups: ['g'], parallelSlot: 'b', intercept: { type: '(..)' } });
    expect(segmentsToPattern([]).pattern).toBe('/');
  });

  test('buildWrapsEdges: без макетов — нет рёбер', () => {
    expect(buildWrapsEdges([], [{ id: 'p', kind: 'page', title: 'p', pathPattern: '/p' }])).toEqual([]);
  });
});
