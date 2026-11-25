/**
 * Сервер трансляции: WebSocket рядом с dev-сервером визуализатора. Карта
 * присылает набор экранов, ввод и команды страницам; сервер шлёт кадры
 * (двоичные) и сообщения страниц (JSON). Новая карта сразу получает
 * последние кадры. Без карт страницы закрываются через паузу. Карт может быть
 * несколько (вкладки, e2e в параллель): открыто объединение их наборов, набор
 * одной карты не закрывает экраны другой.
 */
import type { Server, ServerWebSocket } from 'bun';
import { encodeFrame, parseClientMessage, type ServerMessage, type StreamScreen } from './stream-protocol';
import { StreamService, type StreamServiceOptions } from './stream-service';

/** Опции сервера. */
export type StreamServerOptions = {
  readonly port: number;
  readonly launch: StreamServiceOptions['launch'];
  /** Список вкладок владельца: вкладки прошлого сервера подхватываются. */
  readonly tabsFile?: string;
  /** Через сколько после ухода последней карты закрыть страницы, мс. */
  readonly idleCloseMs?: number;
};

/** Запущенный сервер. */
export type StreamServer = { readonly port: number; stop(): Promise<void> };

const DEFAULT_IDLE_CLOSE_MS = 30_000;

/**
 * Объединение наборов карт: экран с одним ключом — один, живой, если живой хоть у одной карты.
 *
 * @param sets - наборы экранов каждой карты
 * @returns набор для сервиса
 */
export function mergeScreenSets(sets: Iterable<readonly StreamScreen[]>): StreamScreen[] {
  const byKey = new Map<string, StreamScreen>();
  for (const set of sets) {
    for (const s of set) {
      const prev = byKey.get(s.key);
      byKey.set(s.key, prev === undefined ? s : { ...prev, live: prev.live || s.live });
    }
  }
  return [...byKey.values()];
}

/**
 * Запускает сервер трансляции.
 *
 * @param opts - порт, запуск браузера, пауза закрытия
 */
export function startStreamServer(opts: StreamServerOptions): StreamServer {
  /** Карты и их наборы экранов. */
  const clients = new Map<ServerWebSocket<undefined>, readonly StreamScreen[]>();
  const syncAll = (): void => void service.sync(mergeScreenSets(clients.values())).catch(() => undefined);
  let idle: ReturnType<typeof setTimeout> | null = null;
  /** Итог шагов каждого экрана: новая карта получает его сразу. */
  const steps = new Map<string, string>();
  const service = new StreamService({
    launch: opts.launch,
    tabsFile: opts.tabsFile,
    onFrame: (key, jpeg) => {
      const msg = encodeFrame(key, jpeg);
      for (const c of clients.keys()) {
        c.send(msg);
      }
    },
    onPageMessage: (key, data) => {
      const msg: ServerMessage = { t: 'page', key, data };
      const text = JSON.stringify(msg);
      for (const c of clients.keys()) {
        c.send(text);
      }
    },
    onSteps: (key, error) => {
      const msg: ServerMessage = { t: 'steps', key, error };
      const text = JSON.stringify(msg);
      steps.set(key, text);
      for (const c of clients.keys()) {
        c.send(text);
      }
    },
  });
  const server: Server<undefined> = Bun.serve<undefined>({
    port: opts.port,
    hostname: '127.0.0.1',
    fetch(req, srv) {
      return srv.upgrade(req) ? undefined : new Response('Сервер трансляции: нужен WebSocket', { status: 426 });
    },
    websocket: {
      open(ws) {
        clients.set(ws, []);
        if (idle !== null) {
          clearTimeout(idle);
          idle = null;
        }
        for (const [key, jpeg] of service.lastFrames()) {
          ws.send(encodeFrame(key, jpeg));
        }
        for (const text of steps.values()) {
          ws.send(text);
        }
      },
      message(ws, raw) {
        const m = parseClientMessage(String(raw));
        if (m?.t === 'sync') {
          clients.set(ws, m.screens);
          syncAll();
        }
        if (m?.t === 'post') {
          void service.post(m.key, m.data);
        }
        if (m?.t === 'input') {
          void service.input(m.key, m.input);
        }
      },
      close(ws) {
        clients.delete(ws);
        if (clients.size === 0) {
          // Последняя карта ушла: страницы живут паузу — перезагрузка карты их подхватит
          idle = setTimeout(syncAll, opts.idleCloseMs ?? DEFAULT_IDLE_CLOSE_MS);
        } else {
          syncAll();
        }
      },
    },
  });
  return {
    port: server.port ?? opts.port,
    stop: async () => {
      if (idle !== null) {
        clearTimeout(idle);
      }
      void server.stop(true);
      await service.close();
    },
  };
}
