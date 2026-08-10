/**
 * Self-signed TLS dogfood: проксирование HTTPS-origin через visualizer
 * (browser не ругается на self-signed; Vite proxy: secure: false).
 */

/** Хосты, которые можно проксировать (anti-SSRF allowlist). */
export const TLS_PROXY_ALLOWLIST = new Set([
  'vite.localhost',
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

/** Канонический prefix proxy miniapp. */
export const MINIAPP_PROXY_PREFIX = '/__lam_proxy/miniapp';

/**
 * True, если host в allowlist dogfood TLS proxy.
 */
export function isTlsProxyAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (TLS_PROXY_ALLOWLIST.has(h)) {
    return true;
  }
  // *.localhost (mkcert / Vite)
  if (h.endsWith('.localhost')) {
    return true;
  }
  return false;
}

/**
 * Нужен ли TLS proxy для URL (https + allowlist host).
 */
export function shouldUseTlsProxyForUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return false;
    }
    return isTlsProxyAllowedHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Переписывает https://vite.localhost:5175/... → same-origin /__lam_proxy/miniapp/...
 *
 * @param absoluteUrl - live URL страницы
 * @param visualizerOrigin - origin SPA (http://localhost:4310)
 * @returns URL через proxy или исходный
 */
export function rewriteUrlThroughTlsProxy(
  absoluteUrl: string,
  visualizerOrigin: string,
): string {
  try {
    const u = new URL(absoluteUrl);
    if (u.protocol !== 'https:') {
      return absoluteUrl;
    }
    if (!isTlsProxyAllowedHost(u.hostname)) {
      return absoluteUrl;
    }
    // miniapp dogfood: vite.localhost:5175 (и любой порт 5175)
    const isMiniappHost =
      u.hostname === 'vite.localhost' ||
      (u.hostname === 'localhost' && u.port === '5175') ||
      (u.hostname === '127.0.0.1' && u.port === '5175');

    if (isMiniappHost) {
      const path = u.pathname === '' ? '/' : u.pathname;
      const origin = visualizerOrigin.replace(/\/$/, '');
      return `${origin}${MINIAPP_PROXY_PREFIX}${path}${u.search}${u.hash}`;
    }

    // generic allowlist: /__lam_proxy/https/host:port/path
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    const origin = visualizerOrigin.replace(/\/$/, '');
    const path = u.pathname === '' ? '/' : u.pathname;
    return `${origin}/__lam_proxy/https/${hostPort}${path}${u.search}${u.hash}`;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Обратное: proxy URL → target (для логов).
 */
export function describeTlsProxyTarget(url: string): string | null {
  try {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.startsWith(MINIAPP_PROXY_PREFIX)) {
      const rest = u.pathname.slice(MINIAPP_PROXY_PREFIX.length) || '/';
      return `https://vite.localhost:5175${rest}${u.search}`;
    }
    const m = u.pathname.match(/^\/__lam_proxy\/https\/([^/]+)(\/.*)?$/);
    if (m) {
      const host = m[1];
      const path = m[2] ?? '/';
      return `https://${host}${path}${u.search}`;
    }
    return null;
  } catch {
    return null;
  }
}
