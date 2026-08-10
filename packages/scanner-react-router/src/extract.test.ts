import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
  extractPathsFromSource,
  normalizeRrPath,
  rrToPattern,
  scanReactRouterApp,
} from './index';

describe('extractPathsFromSource', () => {
  test('reads miniapp-like config (tabRoute / path / Navigate)', () => {
    const src = `
      tabRoute("feed", "feed"),
      { path: "vacancies/:id" },
      { path: "employer/create" },
      <Navigate to="/feed" />
    `;
    const paths = extractPathsFromSource(src);
    expect(paths).toContain('feed');
    expect(paths).toContain('vacancies/:id');
    expect(paths).toContain('employer/create');
    expect(paths).toContain('/feed');
  });

  test('reads def(id, section, relPath) admin helper', () => {
    const src = `
      def("users", "/users", "users"),
      def("user", "/users", "users/:id"),
      def("settings", "/settings", "settings/*rest"),
    `;
    const paths = extractPathsFromSource(src);
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/:id');
    expect(paths).toContain('/settings/*rest');
  });

  test('skips splat-only and template literals', () => {
    const src = `
      { path: "*" },
      { path: \`/dynamic/\${id}\` },
      { path: "ok" },
    `;
    const paths = extractPathsFromSource(src);
    expect(paths).toContain('ok');
    expect(paths).not.toContain('*');
    expect(paths.some((p) => p.includes('${'))).toBe(false);
  });

  test('childRoute helper second arg', () => {
    const src = `childRoute("detail", "items/:itemId")`;
    const paths = extractPathsFromSource(src);
    expect(paths).toContain('items/:itemId');
  });
});

describe('rrToPattern', () => {
  test('converts :id', () => {
    expect(rrToPattern('/vacancies/:id')).toBe('/vacancies/[id]');
  });

  test('converts optional :step?', () => {
    expect(rrToPattern('/settings/:step?')).toBe('/settings/[step]');
  });

  test('converts splat *code', () => {
    expect(rrToPattern('/docs/*code')).toBe('/docs/[...code]');
  });

  test('converts bare * to rest', () => {
    expect(rrToPattern('/files/*')).toBe('/files/[...rest]');
  });
});

describe('normalizeRrPath', () => {
  test('relative under parent', () => {
    expect(normalizeRrPath('feed', '/')).toBe('/feed');
  });

  test('absolute stays absolute', () => {
    expect(normalizeRrPath('/users/:id', '/')).toBe('/users/:id');
  });

  test('relative under nested parent', () => {
    expect(normalizeRrPath('edit', '/users')).toBe('/users/edit');
  });
});

describe('scanReactRouterApp fixture', () => {
  test('full scan finds tabRoute / path / def routes', async () => {
    const root = path.resolve(
      import.meta.dir,
      '../../../fixtures/react-router-basic',
    );
    const result = await scanReactRouterApp({
      projectRoot: root,
      baseUrl: 'http://localhost:5175',
      exampleParams: {
        id: 'demo',
        dealId: 'deal-1',
        step: 'profile',
        code: 'terms',
        rest: ['a', 'b'],
      },
    });
    const pages = result.document.nodes.filter((n) => n.kind === 'page');
    const patterns = pages.map((p) => p.pathPattern).sort();

    expect(patterns).toContain('/');
    expect(patterns).toContain('/feed');
    expect(patterns).toContain('/wallet');
    expect(patterns).toContain('/vacancies/[id]');
    expect(patterns).toContain('/employer/create');
    expect(patterns).toContain('/dashboard');
    expect(patterns).toContain('/users');
    expect(patterns).toContain('/users/[id]');
    expect(patterns).toContain('/deals/[dealId]');

    const vacancy = pages.find((p) => p.pathPattern === '/vacancies/[id]');
    expect(vacancy?.pathExample).toBe('/vacancies/demo');
    expect(vacancy?.url).toBe('http://localhost:5175/vacancies/demo');

    const okDiag = result.diagnostics.find((d) => d.code === 'SCAN_OK');
    expect(okDiag).toBeDefined();
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });
});
