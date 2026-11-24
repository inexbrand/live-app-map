/**
 * Vite-плагин трансляции: поднимает сервер трансляции рядом с dev-сервером
 * и отдаёт его порт карте по `GET /__lam_stream`.
 */
import type { Plugin } from 'vite';
import type { HostServer } from '../gateway/vite-plugin';
import { launchStreamBrowser } from '../gateway/snapshot-browser';
import { startStreamServer, type StreamServer } from './stream-server';

/** Путь, по которому карта узнаёт порт трансляции. */
export const STREAM_INFO_PATH = '/__lam_stream';
/** Порт по умолчанию; `LAM_STREAM_PORT` меняет его. */
export const DEFAULT_STREAM_PORT = 4321;
const PORT_TRIES = 10;
/** Сервер прошлого запуска vite в этом процессе: закрыть до старта нового, иначе порт уплывёт. */
const GLOBAL_KEY = '__lamStreamServer';

/** Остановка сервера прошлого запуска vite в этом процессе, если он был. */
async function stopPrevious(): Promise<void> {
  const v: unknown = Reflect.get(globalThis, GLOBAL_KEY);
  if (typeof v !== 'object' || v === null || !('stop' in v)) {
    return;
  }
  const stop = v.stop;
  if (typeof stop === 'function') {
    await stop.call(v);
  }
}

function startOnFreePort(wanted: number): StreamServer | undefined {
  for (let i = 0; i < PORT_TRIES; i++) {
    try {
      return startStreamServer({
        port: wanted + i,
        launch: launchStreamBrowser,
      });
    } catch {
      // порт занят — следующий
    }
  }
  return undefined;
}

/** Плагин трансляции. */
export function lamStreamPlugin(): Plugin {
  return {
    name: 'lam-stream',
    configureServer: startStreamOn,
    configurePreviewServer: startStreamOn,
  };
}

/** Сервер трансляции рядом с сервером визуализатора (dev или прод-сборка). */
async function startStreamOn(server: HostServer): Promise<void> {
  await stopPrevious();
  const wanted = Number(process.env['LAM_STREAM_PORT'] ?? DEFAULT_STREAM_PORT);
  const stream = startOnFreePort(wanted);
  if (stream === undefined) {
    server.config.logger.error(`[lam-stream] порты ${wanted}–${wanted + PORT_TRIES - 1} заняты: экраны не покажутся`);
    return;
  }
  Reflect.set(globalThis, GLOBAL_KEY, stream);
  server.config.logger.info(`  ➜  Трансляция экранов: ws://127.0.0.1:${stream.port}/`);
  server.middlewares.use((req, res, next) => {
    if (req.url !== STREAM_INFO_PATH) {
      next();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ port: stream.port }));
  });
  server.httpServer?.on('close', () => void stream.stop());
}
