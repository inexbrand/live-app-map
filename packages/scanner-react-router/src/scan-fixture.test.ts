import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { scanReactRouterApp } from './index';

describe('scanReactRouterApp fixture', () => {
  test('discovers routes from fixtures/react-router-basic', async () => {
    const root = path.resolve(
      import.meta.dir,
      '../../../fixtures/react-router-basic',
    );
    const result = await scanReactRouterApp({
      projectRoot: root,
      baseUrl: 'http://localhost:5173',
      framework: 'react-router',
    });
    const pages = result.document.nodes.filter((n) => n.kind === 'page');
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const patterns = pages.map((p) => p.pathPattern);
    // fixture routes-config + route-config should yield feed-like paths
    expect(patterns.some((p) => p.includes('feed') || p === '/')).toBe(true);
  });
});
