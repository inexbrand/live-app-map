/**
 * Vite SPA :4310 + TLS dogfood proxy (self-signed miniapp) + dynamic /maps catalog.
 */
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { writeMapCatalogIndex } from './src/lib/build-map-catalog-fs';
import { errorReportsMiddleware } from './src/lib/error-reports-middleware';
import { agentStateMiddleware } from './src/lib/agent-state-middleware';
import { mcpAgentMiddleware } from './src/lib/mcp-middleware';
import {
  injectSameOriginApiShim,
  rewriteProxiedAssetPaths,
  shouldRewriteProxiedBody,
} from './src/lib/proxy-path-rewrite';

const spaRoot = path.dirname(fileURLToPath(import.meta.url));
const publicMapsDir = path.join(spaRoot, 'public', 'maps');

/**
 * POST /api/error-reports — client ErrorBoundary → SMTP (если env).
 */
function errorReportsPlugin(): Plugin {
  return {
    name: 'lam-error-reports',
    configureServer(server) {
      server.middlewares.use(errorReportsMiddleware);
      server.middlewares.use(agentStateMiddleware);
      server.middlewares.use(mcpAgentMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(errorReportsMiddleware);
      server.middlewares.use(agentStateMiddleware);
      server.middlewares.use(mcpAgentMiddleware);
    },
  };
}

/**
 * Динамический каталог: GET /maps/index.json из файлов public/maps/*.liveappmap.json.
 * Без хардкода продукта — любая карта в папке появляется в UI.
 */
function mapsCatalogPlugin(): Plugin {
  const serveIndex = (
    _req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    try {
      const catalog = writeMapCatalogIndex(publicMapsDir);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(catalog, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  };

  return {
    name: 'live-app-map-catalog',
    buildStart() {
      writeMapCatalogIndex(publicMapsDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/maps/index.json') {
          serveIndex(req, res, next);
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/maps/index.json') {
          serveIndex(req, res, next);
          return;
        }
        next();
      });
    },
  };
}

/**
 * Middleware: GET /__lam_tls_check?url=https://… — probe TLS (accept self-signed).
 */
function tlsCheckPlugin(): Plugin {
  return {
    name: 'lam-tls-check',
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const rawUrl = req.url ?? '';
          if (!rawUrl.startsWith('/__lam_tls_check')) {
            next();
            return;
          }
          try {
            const u = new URL(rawUrl, 'http://localhost');
            const target = u.searchParams.get('url');
            if (!target) {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'url required' }));
              return;
            }
            let parsed: URL;
            try {
              parsed = new URL(target);
            } catch {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'invalid url' }));
              return;
            }
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'only http(s)' }));
              return;
            }
            const host = parsed.hostname.toLowerCase();
            const allowed =
              host === 'localhost' ||
              host === '127.0.0.1' ||
              host === 'vite.localhost' ||
              host.endsWith('.localhost');
            if (!allowed) {
              res.statusCode = 403;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'host not allowlisted' }));
              return;
            }

            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), 5000);
            try {
              const init: RequestInit & {
                tls?: { rejectUnauthorized?: boolean };
              } = {
                method: 'GET',
                signal: ac.signal,
                // Bun / undici-style: accept self-signed
                tls: { rejectUnauthorized: false },
              };
              const r = await fetch(parsed.href, init);
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: true,
                  status: r.status,
                  protocol: parsed.protocol,
                  host: parsed.host,
                  selfSignedOk: parsed.protocol === 'https:',
                  message:
                    parsed.protocol === 'https:'
                      ? 'HTTPS доступен (self-signed accepted server-side)'
                      : 'HTTP доступен',
                }),
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: false,
                  host: parsed.host,
                  error: message.slice(0, 200),
                  hint:
                    'Проверьте, что miniapp/admin запущен. Для self-signed в iframe включите TLS-proxy.',
                }),
              );
            } finally {
              clearTimeout(timer);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: message }));
          }
        },
      );
    },
  };
}

type ProxyLike = {
  on: (event: string, fn: (...args: unknown[]) => void) => void;
};

/**
 * Снимает X-Frame-Options / CSP frame-ancestors и переписывает absolute `/…`
 * пути ассетов под path-prefix proxy (иначе Vite/Next грузят visualizer).
 *
 * @param proxy - http-proxy
 * @param label - лог
 * @param pathPrefix - e.g. `/__lam_proxy/miniapp`
 */
function attachFrameBypass(
  proxy: ProxyLike,
  label: string,
  pathPrefix: string,
): void {
  proxy.on('error', (...args: unknown[]) => {
    const err = args[0];
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[lam-proxy ${label}]`, message);
  });

  // Без gzip — проще rewrite body
  proxy.on('proxyReq', (...args: unknown[]) => {
    const proxyReq = args[0] as {
      setHeader: (k: string, v: string) => void;
    };
    proxyReq.setHeader('accept-encoding', 'identity');
  });

  proxy.on('proxyRes', (...args: unknown[]) => {
    const proxyRes = args[0] as {
      headers: Record<string, string | string[] | undefined>;
      statusCode?: number;
      on: (ev: string, fn: (chunk?: Buffer) => void) => void;
      pipe: (dest: unknown) => void;
    };
    const req = args[1];
    const res = args[2] as {
      writeHead: (code: number, headers?: Record<string, unknown>) => void;
      end: (body?: string | Buffer) => void;
      writableEnded?: boolean;
    };

    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['X-Frame-Options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['Content-Security-Policy'];
    // length пересчитаем после rewrite
    delete proxyRes.headers['content-length'];
    delete proxyRes.headers['Content-Length'];
    delete proxyRes.headers['content-encoding'];
    delete proxyRes.headers['Content-Encoding'];

    const ctRaw = proxyRes.headers['content-type'] ?? proxyRes.headers['Content-Type'];
    const ct = Array.isArray(ctRaw) ? ctRaw[0] : ctRaw;
    const rewriteText = shouldRewriteProxiedBody(ct);

    // selfHandleResponse: true → всегда сами пишем ответ
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
      let buf = Buffer.concat(chunks);
      if (rewriteText) {
        let text = rewriteProxiedAssetPaths(buf.toString('utf8'), pathPrefix);
        // HTML: same-origin `/api` → path-prefix (miniapp VITE_API_BASE_URL="")
        const ctLower = (ct ?? '').toLowerCase();
        if (ctLower.includes('text/html')) {
          text = injectSameOriginApiShim(text, pathPrefix);
        }
        buf = Buffer.from(text, 'utf8');
      }
      const headers: Record<string, string | number | string[]> = {};
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v === undefined) {
          continue;
        }
        const lk = k.toLowerCase();
        if (
          lk === 'content-length' ||
          lk === 'content-encoding' ||
          lk === 'x-frame-options' ||
          lk === 'content-security-policy'
        ) {
          continue;
        }
        headers[k] = v;
      }
      headers['content-length'] = buf.length;
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(buf);
      void req;
    });
  });
}

export default defineConfig({
  plugins: [
    react(),
    mapsCatalogPlugin(),
    tlsCheckPlugin(),
    errorReportsPlugin(),
  ],
  server: {
    port: 4310,
    host: true,
    // Miniapp/site path-proxy + asset rewrite. Admin — direct (no path proxy).
    proxy: {
      '/__lam_proxy/miniapp': {
        target: 'https://vite.localhost:5175',
        changeOrigin: true,
        secure: false,
        ws: true,
        selfHandleResponse: true,
        rewrite: (p) => {
          const rest = p.replace(/^\/__lam_proxy\/miniapp/, '');
          return rest.length === 0 ? '/' : rest;
        },
        configure: (proxy) => {
          attachFrameBypass(proxy, 'miniapp', '/__lam_proxy/miniapp');
        },
      },
      // legacy bookmark / stale maps: still proxy admin but WITH asset rewrite
      '/__lam_proxy/admin': {
        target: 'http://localhost:16002',
        changeOrigin: true,
        ws: true,
        selfHandleResponse: true,
        rewrite: (p) => {
          const rest = p.replace(/^\/__lam_proxy\/admin/, '');
          return rest.length === 0 ? '/' : rest;
        },
        configure: (proxy) => {
          attachFrameBypass(proxy, 'admin', '/__lam_proxy/admin');
        },
      },
      '/__lam_proxy/site': {
        target: 'http://localhost:16001',
        changeOrigin: true,
        ws: true,
        selfHandleResponse: true,
        rewrite: (p) => {
          const rest = p.replace(/^\/__lam_proxy\/site/, '');
          return rest.length === 0 ? '/' : rest;
        },
        configure: (proxy) => {
          attachFrameBypass(proxy, 'site', '/__lam_proxy/site');
        },
      },
      '/__lam_proxy/https': {
        target: 'https://127.0.0.1',
        changeOrigin: true,
        secure: false,
        ws: true,
        selfHandleResponse: true,
        bypass() {
          return undefined;
        },
        router: (req) => {
          const url = req.url ?? '';
          const m = url.match(/^\/__lam_proxy\/https\/([^/?#]+)/);
          if (!m?.[1]) {
            return 'https://127.0.0.1';
          }
          const hostPort = m[1];
          const host = hostPort.split(':')[0]?.toLowerCase() ?? '';
          if (
            host !== 'localhost' &&
            host !== '127.0.0.1' &&
            host !== 'vite.localhost' &&
            !host.endsWith('.localhost')
          ) {
            return 'https://127.0.0.1';
          }
          return `https://${hostPort}`;
        },
        rewrite: (p) => {
          const m = p.match(/^\/__lam_proxy\/https\/[^/?#]+(.*)$/);
          const rest = m?.[1];
          return rest && rest.length > 0 ? rest : '/';
        },
        configure: (proxy) => {
          // generic: prefix is full path base from request — use host segment
          attachFrameBypass(proxy, 'https', '/__lam_proxy/https');
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@xyflow/react', 'zustand', '@dagrejs/dagre'],
  },
});
