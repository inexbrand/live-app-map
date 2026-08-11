import { describe, expect, test } from 'bun:test';
import {
  buildSameOriginApiShimScript,
  injectSameOriginApiShim,
  rewriteProxiedAssetPaths,
  shouldRewriteProxiedBody,
} from './proxy-path-rewrite';

describe('proxy-path-rewrite', () => {
  test('prefixes absolute asset paths', () => {
    const html =
      '<script type="module" src="/@vite/client"></script><link href="/src/main.tsx">';
    const out = rewriteProxiedAssetPaths(html, '/__lam_proxy/admin');
    expect(out).toContain('src="/__lam_proxy/admin/@vite/client"');
    expect(out).toContain('href="/__lam_proxy/admin/src/main.tsx"');
  });

  test('does not touch protocol-relative, http, or self-closing tags', () => {
    const html =
      '<meta name="x" content="korbor admin" /><img src="//cdn.example/a.png"><a href="https://x.com/y">';
    const out = rewriteProxiedAssetPaths(html, '/__lam_proxy/site');
    expect(out).toContain('content="korbor admin" />');
    expect(out).not.toContain('admin" /__lam_proxy');
    expect(out).toContain('//cdn.example/a.png');
    expect(out).toContain('https://x.com/y');
  });

  test('shouldRewrite content types', () => {
    expect(shouldRewriteProxiedBody('text/html; charset=utf-8')).toBe(true);
    expect(shouldRewriteProxiedBody('application/javascript')).toBe(true);
    expect(shouldRewriteProxiedBody('image/png')).toBe(false);
  });

  test('API shim prefixes /api under path proxy', () => {
    const shim = buildSameOriginApiShimScript('/__lam_proxy/miniapp');
    expect(shim).toContain('data-lam-api-shim="1"');
    expect(shim).toContain('/__lam_proxy/miniapp');
    expect(shim).toContain('window.fetch');
  });

  test('injectSameOriginApiShim вставляет в head и идемпотентен', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
    const once = injectSameOriginApiShim(html, '/__lam_proxy/miniapp');
    expect(once).toContain('data-lam-api-shim="1"');
    expect(once.indexOf('<head>') < once.indexOf('data-lam-api-shim')).toBe(true);
    const twice = injectSameOriginApiShim(once, '/__lam_proxy/miniapp');
    expect(twice).toBe(once);
  });
});
