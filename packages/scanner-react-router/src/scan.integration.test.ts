import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { humanTitle } from '@live-app-map/scanner-core';
import { scanReactRouterApp } from './index';

/**
 * Integration: полный scanReactRouterApp на fixtures/react-router-basic
 * (routes-config + admin route-config + package.json с react-router-dom).
 */
describe('scanReactRouterApp integration', () => {
  const fixtureRoot = path.resolve(
    import.meta.dir,
    '../../../fixtures/react-router-basic',
  );

  test('scan fixture → pages ≥ 3, edges optional, titles from humanTitle', async () => {
    const result = await scanReactRouterApp({
      projectRoot: fixtureRoot,
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
    expect(pages.length).toBeGreaterThanOrEqual(3);

    const patterns = pages.map((p) => p.pathPattern);
    expect(patterns).toContain('/');
    expect(patterns.some((p) => p.includes('feed') || p.includes('dashboard'))).toBe(
      true,
    );

    // edges optional: graph may have 0+ link edges; never negative / crash
    expect(Array.isArray(result.document.edges)).toBe(true);
    expect(result.document.edges.length).toBeGreaterThanOrEqual(0);

    const rootPage = pages.find((p) => p.pathPattern === '/');
    // humanTitle('/') = «Главная» (scanner-core, единый RU title)
    expect(rootPage?.title).toBe(humanTitle('/'));
    expect(rootPage?.title).toBe('Главная');

    const vacancy = pages.find((p) => p.pathPattern === '/vacancies/[id]');
    if (vacancy !== undefined) {
      expect(vacancy.title).toBe(humanTitle('/vacancies/[id]'));
      expect(vacancy.title).toBe('vacancies / id');
      expect(vacancy.pathExample).toBe('/vacancies/demo');
    }

    const okDiag = result.diagnostics.find((d) => d.code === 'SCAN_OK');
    expect(okDiag).toBeDefined();
    expect(result.document.project.framework).toBe('react-router');
  });

  test('fixture package.json marks react-router surface', async () => {
    const pkgPath = path.join(fixtureRoot, 'package.json');
    const pkg = JSON.parse(await Bun.file(pkgPath).text()) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    expect(
      Object.keys(deps).some(
        (k) => k === 'react-router' || k === 'react-router-dom',
      ),
    ).toBe(true);
  });
});
