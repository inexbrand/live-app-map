import { describe, expect, test } from 'bun:test';
import {
  describeTlsProxyTarget,
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

  test('прочие локальные https — общий proxy с host:port; http, чужой хост и мусор — как есть', () => {
    expect(rewriteUrlThroughTlsProxy('https://localhost:5175/a', 'http://localhost:4310/')).toBe('http://localhost:4310/__lam_proxy/miniapp/a');
    expect(rewriteUrlThroughTlsProxy('https://admin.localhost:8443/x?y=1#h', 'http://localhost:4310')).toBe('http://localhost:4310/__lam_proxy/https/admin.localhost:8443/x?y=1#h');
    expect(rewriteUrlThroughTlsProxy('https://127.0.0.1/', 'http://localhost:4310')).toBe('http://localhost:4310/__lam_proxy/https/127.0.0.1/');
    expect(rewriteUrlThroughTlsProxy('http://localhost:5175/', 'http://localhost:4310')).toBe('http://localhost:5175/');
    expect(rewriteUrlThroughTlsProxy('https://evil.com/', 'http://localhost:4310')).toBe('https://evil.com/');
    expect(rewriteUrlThroughTlsProxy('не url', 'http://localhost:4310')).toBe('не url');
    expect(shouldUseTlsProxyForUrl('не url')).toBe(false);
    expect(isTlsProxyAllowedHost('Admin.LOCALHOST')).toBe(true);
  });

  test('обратное: адрес proxy → целевой https', () => {
    expect(describeTlsProxyTarget('/__lam_proxy/miniapp/feed?x=1')).toBe('https://vite.localhost:5175/feed?x=1');
    expect(describeTlsProxyTarget('/__lam_proxy/miniapp')).toBe('https://vite.localhost:5175/');
    expect(describeTlsProxyTarget('/__lam_proxy/https/admin.localhost:8443/x')).toBe('https://admin.localhost:8443/x');
    expect(describeTlsProxyTarget('/__lam_proxy/https/admin.localhost:8443')).toBe('https://admin.localhost:8443/');
    expect(describeTlsProxyTarget('/other')).toBeNull();
    expect(describeTlsProxyTarget('http://[bad')).toBeNull();
  });
});
