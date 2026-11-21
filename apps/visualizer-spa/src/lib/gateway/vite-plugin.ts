/**
 * Vite-плагин шлюза: поднимает шлюз живых экранов рядом с dev-сервером
 * визуализатора и отдаёт REST профилей `/__lam_sessions`.
 */
import type { Plugin } from 'vite';
import { resolveLamDir } from '@live-app-map/mcp-server';
import { startGateway } from './gateway-server';
import { createSessionsMiddleware } from './sessions-middleware';
import { resolveSessionsDir, SessionStore } from './session-store';

/** Порт шлюза по умолчанию; `LAM_GATEWAY_PORT` меняет его. */
export const DEFAULT_GATEWAY_PORT = 4320;
/** Сколько соседних портов пробовать, если занят (другой checkout визуализатора). */
const PORT_TRIES = 10;

/**
 * Плагин шлюза.
 */
export function lamGatewayPlugin(): Plugin {
  return {
    name: 'lam-gateway',
    configureServer(server) {
      const store = new SessionStore(resolveSessionsDir(resolveLamDir(process.cwd())));
      const wanted = Number(process.env['LAM_GATEWAY_PORT'] ?? DEFAULT_GATEWAY_PORT);
      let started: ReturnType<typeof startGateway> | undefined;
      for (let i = 0; i < PORT_TRIES && started === undefined; i++) {
        try {
          started = startGateway({ port: wanted + i, store, log: (l) => server.config.logger.warn(l) });
        } catch {
          // порт занят — следующий
        }
      }
      if (started === undefined) {
        server.config.logger.error(`[lam-gateway] порты ${wanted}–${wanted + PORT_TRIES - 1} заняты: живые экраны пойдут напрямую`);
        return;
      }
      const gateway = started;
      server.config.logger.info(`  ➜  Шлюз живых экранов: http://<профиль>--<цель>.localhost:${gateway.port}/`);
      server.middlewares.use(createSessionsMiddleware(store, gateway.port ?? wanted));
      server.httpServer?.on('close', () => {
        void gateway.stop(true);
      });
    },
  };
}
