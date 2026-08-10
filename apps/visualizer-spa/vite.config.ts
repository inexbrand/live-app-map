/**
 * Vite SPA :4310 + TLS dogfood proxy (self-signed miniapp).
 */
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

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

export default defineConfig({
  plugins: [react(), tlsCheckPlugin()],
  server: {
    port: 4310,
    host: true,
    // Self-signed miniapp (mkcert / basic-ssl): secure:false
    proxy: {
      '/__lam_proxy/miniapp': {
        target: 'https://vite.localhost:5175',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (p) => {
          const rest = p.replace(/^\/__lam_proxy\/miniapp/, '');
          return rest.length === 0 ? '/' : rest;
        },
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn('[lam-proxy miniapp]', err.message);
          });
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', () => {
              /* ignore ws proxy noise */
            });
          });
        },
      },
      // generic https://host:port via /__lam_proxy/https/host:port/...
      '/__lam_proxy/https': {
        target: 'https://127.0.0.1',
        changeOrigin: true,
        secure: false,
        ws: true,
        bypass() {
          // router handled below via configureServer? use router function
          return undefined;
        },
        router: (req) => {
          const url = req.url ?? '';
          const m = url.match(/^\/__lam_proxy\/https\/([^/?#]+)/);
          if (!m?.[1]) {
            return 'https://127.0.0.1';
          }
          const hostPort = m[1];
          // only local dogfood hosts
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
      },
    },
  },
  optimizeDeps: {
    include: ['@xyflow/react', 'zustand', '@dagrejs/dagre'],
  },
});
