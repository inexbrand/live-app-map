/**
 * `/__lam_proxy/https/<host:port>/<path>` → `https://<host:port>/<path>`.
 *
 * Прокси для локальных HTTPS-приложений с self-signed сертификатом
 * (кроме miniapp, у которого свой фиксированный маршрут в vite.config).
 * У vite proxy нет выбора цели по запросу, поэтому это свой middleware.
 * Только allowlist локальных хостов (`isTlsProxyAllowedHost`); WebSocket
 * (HMR) не проксируется.
 */
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { requestPath, sendError, type DevMiddleware } from './dev-http';
import { finalizeProxiedBody, sanitizeProxiedHeaders } from './proxy-response';
import { isTlsProxyAllowedHost } from './tls-proxy';

/** Общий префикс маршрута. */
export const HTTPS_PROXY_PREFIX = '/__lam_proxy/https';

/** Разобранная цель прокси. */
export type HttpsProxyTarget = {
  readonly hostname: string;
  readonly port: number;
  /** Префикс именно этой цели — под него переписываются ассеты. */
  readonly prefix: string;
  /** Путь с query на upstream. */
  readonly path: string;
};

/**
 * Цель прокси по URL запроса; null — не наш маршрут или хост не разрешён.
 *
 * @param url - `req.url` (путь + query)
 */
export function parseHttpsProxyTarget(url: string): HttpsProxyTarget | null {
  const m = /^\/__lam_proxy\/https\/([^/?#]+)(.*)$/.exec(url);
  if (m === null || m[1] === undefined) {
    return null;
  }
  const hostPort = m[1];
  let parsed: URL;
  try {
    parsed = new URL(`https://${hostPort}`);
  } catch {
    return null;
  }
  if (!isTlsProxyAllowedHost(parsed.hostname)) {
    return null;
  }
  const rest = m[2] ?? '';
  return {
    hostname: parsed.hostname,
    port: parsed.port === '' ? 443 : Number(parsed.port),
    prefix: `${HTTPS_PROXY_PREFIX}/${hostPort}`,
    path: rest === '' || rest.startsWith('?') ? `/${rest}` : rest,
  };
}

function forward(req: IncomingMessage, res: Parameters<DevMiddleware>[1], target: HttpsProxyTarget): void {
  const headers = { ...req.headers, host: `${target.hostname}:${target.port}`, 'accept-encoding': 'identity' };
  const upstream = httpsRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: req.method,
      headers,
      // self-signed dev-сертификаты — ради них прокси и существует
      rejectUnauthorized: false,
    },
    (up) => {
      const chunks: Buffer[] = [];
      up.on('data', (c: Buffer) => chunks.push(c));
      up.on('end', () => {
        const ct = up.headers['content-type'];
        const body = finalizeProxiedBody(Buffer.concat(chunks), ct, target.prefix);
        res.writeHead(up.statusCode ?? 502, { ...sanitizeProxiedHeaders(up.headers), 'content-length': body.length });
        res.end(body);
      });
      up.on('error', (err) => sendError(res, 502, err.message));
    },
  );
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      sendError(res, 502, `upstream ${target.hostname}:${target.port}: ${err.message}`);
    }
  });
  req.pipe(upstream);
}

/**
 * Middleware прокси.
 */
export const httpsPathProxyMiddleware: DevMiddleware = (req, res, next) => {
  if (!requestPath(req).startsWith(`${HTTPS_PROXY_PREFIX}/`)) {
    next();
    return;
  }
  const target = parseHttpsProxyTarget(req.url ?? '');
  if (target === null) {
    sendError(res, 403, 'хост не в allowlist (только localhost / *.localhost / 127.0.0.1)');
    return;
  }
  forward(req, res, target);
};
