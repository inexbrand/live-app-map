/**
 * Ответ upstream для path-прокси визуализатора: заголовки, мешающие
 * iframe и переписыванию тела, убираются; текстовое тело переписывается
 * под префикс прокси. Общая часть vite proxy (miniapp/admin/site) и
 * https-path-proxy.
 */
import type { IncomingHttpHeaders } from 'node:http';
import {
  injectSameOriginApiShim,
  rewriteProxiedAssetPaths,
  shouldRewriteProxiedBody,
} from './proxy-path-rewrite';

/** Заголовки, которые прокси не передаёт дальше. */
const DROPPED_HEADERS: ReadonlySet<string> = new Set([
  // длину и сжатие пересчитываем после rewrite; chunked нельзя вместе с length
  'content-length',
  'content-encoding',
  'transfer-encoding',
  // иначе страница не встанет в iframe визуализатора
  'x-frame-options',
  'content-security-policy',
]);

/**
 * Заголовки ответа без запрещённых для iframe и rewrite.
 *
 * @param headers - заголовки upstream
 */
export function sanitizeProxiedHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined && !DROPPED_HEADERS.has(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Тело ответа после rewrite (HTML/JS/CSS) или как есть (бинарное).
 *
 * @param body - тело upstream целиком
 * @param contentType - content-type upstream
 * @param pathPrefix - префикс прокси, напр. `/__lam_proxy/miniapp`
 */
export function finalizeProxiedBody(
  body: Buffer,
  contentType: string | undefined,
  pathPrefix: string,
): Buffer {
  if (!shouldRewriteProxiedBody(contentType)) {
    return body;
  }
  let text = rewriteProxiedAssetPaths(body.toString('utf8'), pathPrefix);
  if ((contentType ?? '').toLowerCase().includes('text/html')) {
    // same-origin `/api` приложения → под префикс прокси
    text = injectSameOriginApiShim(text, pathPrefix);
  }
  return Buffer.from(text, 'utf8');
}
