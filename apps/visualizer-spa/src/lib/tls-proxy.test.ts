import { describe, expect, test } from 'bun:test';
import {
  isTlsProxyAllowedHost,
  rewriteUrlThroughTlsProxy,
  shouldUseTlsProxyForUrl,
} from './tls-proxy';

describe('tls-proxy', () => {
  test('allowlist vite.localhost', () => {
    expect(isTlsProxyAllowedHost('vite.localhost')).toBe(true);
    expect(isTlsProxyAllowedHost('evil.com')).toBe(false);
  });

  test('should proxy https miniapp', () => {
    expect(shouldUseTlsProxyForUrl('https://vite.localhost:5175/feed')).toBe(
      true,
    );
    expect(shouldUseTlsProxyForUrl('http://localhost:16002/')).toBe(false);
  });

  test('rewrite to same-origin miniapp proxy', () => {
    const out = rewriteUrlThroughTlsProxy(
      'https://vite.localhost:5175/feed?lam_role=recruiter',
      'http://localhost:4310',
    );
    expect(out).toBe(
      'http://localhost:4310/__lam_proxy/miniapp/feed?lam_role=recruiter',
    );
  });
});
