import { describe, expect, test } from 'bun:test';
import { extractDynamicParams, materializePath } from './index';

describe('materializePath', () => {
  test('static', () => {
    expect(materializePath('/about').path).toBe('/about');
  });

  test('dynamic with default example', () => {
    const r = materializePath('/users/[id]');
    expect(r.path).toBe('/users/example');
    expect(r.missing).toEqual(['id']);
  });

  test('dynamic with params', () => {
    const r = materializePath('/users/[id]', { id: 'demo' });
    expect(r.path).toBe('/users/demo');
    expect(r.missing).toEqual([]);
  });

  test('catch-all', () => {
    const r = materializePath('/shop/[...slug]', { slug: ['a', 'b'] });
    expect(r.path).toBe('/shop/a/b');
  });

  test('byRoute override', () => {
    const r = materializePath('/blog/[locale]/[slug]', {
      byRoute: {
        '/blog/[locale]/[slug]': { locale: 'en', slug: 'hello' },
      },
    });
    expect(r.path).toBe('/blog/en/hello');
  });
});

describe('extractDynamicParams', () => {
  test('collects names', () => {
    expect(extractDynamicParams('/a/[id]/b/[...slug]')).toEqual(['id', 'slug']);
  });
});
