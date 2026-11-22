/**
 * Vite-плагин шлюза: поднимает шлюз живых экранов рядом с dev-сервером
 * визуализатора и отдаёт REST профилей `/__lam_sessions`.
 */
import type { Plugin } from 'vite';
import { resolveLamDir } from '@live-app-map/mcp-server';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startGateway } from './gateway-server';
import { createSnapshotMiddleware } from './snapshot-middleware';
import { SnapshotService } from './snapshot-service';
import { createSessionsMiddleware } from './sessions-middleware';
import { resolveSessionsDir, SessionStore } from './session-store';

/** Порт шлюза по умолчанию; `LAM_GATEWAY_PORT` меняет его. */
export const DEFAULT_GATEWAY_PORT = 4320;
/** Сколько соседних портов пробовать, если занят (другой checkout визуализатора). */
const PORT_TRIES = 10;
/**
 * Ключ globalThis с шлюзом этого процесса: при перезапуске vite модуль
 * плагина грузится заново, а старый шлюз ещё держит порт — его надо закрыть
 * до старта нового, иначе порт «уплывает» на соседний.
 */
const GLOBAL_KEY = '__lamGatewayServer';

type Stoppable = { stop: (force: boolean) => unknown };

function previousGateway(): Stoppable | undefined {
  const v: unknown = Reflect.get(globalThis, GLOBAL_KEY);
  if (typeof v !== 'object' || v === null || !('stop' in v)) {
    return undefined;
  }
  const stop = v.stop;
  return typeof stop === 'function' ? { stop: (f) => Reflect.apply(stop, v, [f]) } : undefined;
}

type ViteServer = Parameters<NonNullable<Extract<Plugin['configureServer'], (...args: never[]) => unknown>>>[0];

/** Шлюз на первом свободном порту из PORT_TRIES подряд; все заняты — undefined. */
function startOnFreePort(wanted: number, store: SessionStore, log: (line: string) => void): ReturnType<typeof startGateway> | undefined {
  for (let i = 0; i < PORT_TRIES; i++) {
    try {
      return startGateway({ port: wanted + i, store, log });
    } catch {
      // порт занят — следующий
    }
  }
  return undefined;
}

/** REST профилей и снимков рядом с шлюзом; закрытие dev-сервера закрывает и их. */
function mountGateway(server: ViteServer, gateway: ReturnType<typeof startGateway>, store: SessionStore, sessionsDir: string, wanted: number): void {
  Reflect.set(globalThis, GLOBAL_KEY, gateway);
  server.config.logger.info(`  ➜  Шлюз живых экранов: http://<профиль>--<цель>.localhost:${gateway.port}/`);
  const port = gateway.port ?? wanted;
  // Снимки рядом с профилями, тоже вне git: на них могут быть данные под входом.
  const snapshots = new SnapshotService({ dir: path.join(path.dirname(sessionsDir), '.lam-snapshots'), launch: () => chromium.launch() });
  server.middlewares.use(createSessionsMiddleware(store, port));
  server.middlewares.use(createSnapshotMiddleware(snapshots, port));
  server.httpServer?.on('close', () => {
    void gateway.stop(true);
    void snapshots.close();
  });
}

/**
 * Плагин шлюза.
 */
export function lamGatewayPlugin(): Plugin {
  return {
    name: 'lam-gateway',
    configureServer(server) {
      previousGateway()?.stop(true);
      const sessionsDir = resolveSessionsDir(resolveLamDir(process.cwd()));
      const store = new SessionStore(sessionsDir);
      const wanted = Number(process.env['LAM_GATEWAY_PORT'] ?? DEFAULT_GATEWAY_PORT);
      const gateway = startOnFreePort(wanted, store, (l) => server.config.logger.warn(l));
      if (gateway === undefined) {
        server.config.logger.error(`[lam-gateway] порты ${wanted}–${wanted + PORT_TRIES - 1} заняты: живые экраны пойдут напрямую`);
        return;
      }
      mountGateway(server, gateway, store, sessionsDir, wanted);
    },
  };
}
