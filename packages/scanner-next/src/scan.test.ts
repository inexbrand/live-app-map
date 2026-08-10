import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { parseSegment, scanNextApp, segmentsToPattern } from './index';

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
    const user = pages.find((p) => p.pathPattern === '/users/[id]');
    expect(user?.pathExample).toBe('/users/demo');
    expect(user?.url).toBe('http://localhost:3000/users/demo');
  });
});
