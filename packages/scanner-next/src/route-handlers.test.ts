/**
 * Unit: includeRouteHandlers + fixture App Router route.ts.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { scanNextApp } from './index';

const fixtureRoot = path.resolve(
  import.meta.dir,
  '../../../fixtures/next-app-router-basic',
);

describe('route-handlers (App Router fixture)', () => {
  test('без includeRouteHandlers — узлов route-handler нет', async () => {
    const result = await scanNextApp({
      projectRoot: fixtureRoot,
      baseUrl: 'http://localhost:3000',
    });
    expect(result.document.nodes.some((n) => n.kind === 'route-handler')).toBe(
      false,
    );
  });

  test('includeRouteHandlers: true → node kind route-handler для /api/health', async () => {
    const result = await scanNextApp({
      projectRoot: fixtureRoot,
      baseUrl: 'http://localhost:3000',
      includeRouteHandlers: true,
    });
    const handlers = result.document.nodes.filter(
      (n) => n.kind === 'route-handler',
    );
    expect(handlers.length).toBeGreaterThanOrEqual(1);
    const health = handlers.find((h) => h.pathPattern === '/api/health');
    expect(health).toBeDefined();
    expect(health?.id).toBe('route-handler:/api/health');
    expect(health?.kind).toBe('route-handler');
    expect(health?.title).toBe('API /api/health');
    expect(health?.source?.file).toMatch(/api\/health\/route\.ts$/);
    expect(health?.tags).toContain('api');
    expect(health?.iframePolicy?.enabled).toBe(false);
  });
});
