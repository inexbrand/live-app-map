/**
 * Self-signed TLS dogfood: проксирование HTTPS-origin через visualizer
 * (browser не ругается на self-signed; Vite proxy: secure: false).
 */

/** Хосты, которые можно проксировать (anti-SSRF allowlist). */
export const TLS_PROXY_ALLOWLIST = new Set(['vite.localhost', 'localhost', '127.0.0.1', '[::1]']);

/** Канонический prefix proxy miniapp. */
export const MINIAPP_PROXY_PREFIX = '/__lam_proxy/miniapp';

/**
 * True, если host в allowlist dogfood TLS proxy (и *.localhost — mkcert / Vite).
 */
export function isTlsProxyAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return TLS_PROXY_ALLOWLIST.has(h) || h.endsWith('.localhost');
}

/** URL или null, если не разбирается. */
function parseUrl(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

/**
 * Нужен ли TLS proxy для URL (https + allowlist host).
 */
export function shouldUseTlsProxyForUrl(url: string): boolean {
  const u = parseUrl(url);
  return u !== null && u.protocol === 'https:' && isTlsProxyAllowedHost(u.hostname);
}

/** miniapp dogfood: vite.localhost и порт 5175 на localhost/127.0.0.1. */
function isMiniappHost(u: URL): boolean {
  return u.hostname === 'vite.localhost' || ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '5175');
}

/**
 * Переписывает https://vite.localhost:5175/... → same-origin /__lam_proxy/miniapp/...
 *
 * @param absoluteUrl - live URL страницы
 * @param visualizerOrigin - origin SPA (http://localhost:4310)
 * @returns URL через proxy или исходный
 */
export function rewriteUrlThroughTlsProxy(absoluteUrl: string, visualizerOrigin: string): string {
  const u = parseUrl(absoluteUrl);
  if (u === null || !shouldUseTlsProxyForUrl(absoluteUrl)) {
    return absoluteUrl;
  }
  const origin = visualizerOrigin.replace(/\/$/, '');
  const path = u.pathname === '' ? '/' : u.pathname;
  // generic allowlist: /__lam_proxy/https/host:port/path
  const prefix = isMiniappHost(u) ? MINIAPP_PROXY_PREFIX : `/__lam_proxy/https/${u.port ? `${u.hostname}:${u.port}` : u.hostname}`;
  return `${origin}${prefix}${path}${u.search}${u.hash}`;
}

/**
 * Обратное: proxy URL → target (для логов).
 */
export function describeTlsProxyTarget(url: string): string | null {
  const u = parseUrl(url, 'http://localhost');
  if (u === null) {
    return null;
  }
  if (u.pathname.startsWith(MINIAPP_PROXY_PREFIX)) {
    const rest = u.pathname.slice(MINIAPP_PROXY_PREFIX.length) || '/';
    return `https://vite.localhost:5175${rest}${u.search}`;
  }
  const m = u.pathname.match(/^\/__lam_proxy\/https\/([^/]+)(\/.*)?$/);
  return m ? `https://${m[1]}${m[2] ?? '/'}${u.search}` : null;
}
