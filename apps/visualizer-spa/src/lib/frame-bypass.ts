/**
 * Ответ path-proxy для iframe: снимает X-Frame-Options / CSP frame-ancestors и
 * переписывает абсолютные `/…` пути ассетов под префикс proxy (иначе Vite/Next
 * грузят visualizer).
 */
import { finalizeProxiedBody, sanitizeProxiedHeaders } from './proxy-response';

/** http-proxy: подписка на события. */
export type ProxyLike = {
  on: (event: string, fn: (...args: unknown[]) => void) => void;
};

/** Ответ upstream. */
type ProxyRes = {
  headers: Record<string, string | string[] | undefined>;
  statusCode?: number;
  on: (ev: string, fn: (chunk?: Buffer) => void) => void;
};

/** Ответ клиенту. */
type ClientRes = {
  writeHead: (code: number, headers?: Record<string, unknown>) => void;
  end: (body?: string | Buffer) => void;
  writableEnded?: boolean;
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Тип содержимого: первый заголовок, если их несколько. */
function contentType(headers: ProxyRes['headers']): string | undefined {
  const ctRaw = headers['content-type'];
  return Array.isArray(ctRaw) ? ctRaw[0] : ctRaw;
}

/**
 * Собирает ответ upstream целиком (selfHandleResponse: true — пишем сами) и отдаёт
 * переписанное тело с фиксированной длиной; обрыв upstream — 502, а не висящий ответ.
 */
function relayResponse(proxyRes: ProxyRes, res: ClientRes, label: string, pathPrefix: string): void {
  const chunks: Buffer[] = [];
  proxyRes.on('data', (chunk?: Buffer) => {
    if (chunk) {
      chunks.push(chunk);
    }
  });
  proxyRes.on('end', () => {
    if (res.writableEnded) {
      return;
    }
    const buf = finalizeProxiedBody(Buffer.concat(chunks), contentType(proxyRes.headers), pathPrefix);
    res.writeHead(proxyRes.statusCode ?? 200, { ...sanitizeProxiedHeaders(proxyRes.headers), 'content-length': buf.length });
    res.end(buf);
  });
  proxyRes.on('error', (...errArgs: unknown[]) => {
    console.warn(`[lam-proxy ${label}] proxyRes`, messageOf(errArgs[0]));
    if (!res.writableEnded) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`lam-proxy ${label}: upstream error`);
    }
  });
}

/**
 * Подключает обработку ответов к http-proxy.
 *
 * @param proxy - http-proxy
 * @param label - имя в логе
 * @param pathPrefix - например `/__lam_proxy/miniapp`
 */
export function attachFrameBypass(proxy: ProxyLike, label: string, pathPrefix: string): void {
  proxy.on('error', (...args: unknown[]) => {
    console.warn(`[lam-proxy ${label}]`, messageOf(args[0]));
  });
  // Без gzip — проще переписать тело
  proxy.on('proxyReq', (...args: unknown[]) => {
    const proxyReq = args[0] as { setHeader: (k: string, v: string) => void };
    proxyReq.setHeader('accept-encoding', 'identity');
  });
  proxy.on('proxyRes', (...args: unknown[]) => {
    relayResponse(args[0] as ProxyRes, args[2] as ClientRes, label, pathPrefix);
  });
}

/**
 * Путь upstream без префикса proxy; пусто — корень.
 *
 * @param p - путь запроса
 * @param prefix - префикс proxy
 * @returns путь для upstream
 */
export function stripProxyPrefix(p: string, prefix: string): string {
  const rest = p.startsWith(prefix) ? p.slice(prefix.length) : p;
  return rest.length === 0 ? '/' : rest;
}
