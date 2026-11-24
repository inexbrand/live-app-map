/**
 * Сервер трансляции для DOM-тестов: настоящий WebSocket без браузера.
 * Записывает, что прислала карта, и шлёт ей сообщения страниц.
 */
import type { Server, ServerWebSocket } from 'bun';
import { parseClientMessage, type ClientMessage } from '../lib/stream/stream-protocol';
import { streamClient } from '../lib/stream/stream-client';

/** Сервер теста. */
export type FakeStream = {
  /** Всё, что прислала карта. */
  readonly received: ClientMessage[];
  /** Что карта отправила странице экрана. */
  postsTo(key: string): unknown[];
  /** Карта подключилась. */
  ready(): Promise<void>;
  /** Сообщение страницы экрана карте; ждёт, пока карта подключится. */
  page(key: string, data: unknown): Promise<void>;
  stop(): void;
};

/** Поднимает сервер и переключает на него клиент вкладки. */
export function startFakeStream(): FakeStream {
  const received: ClientMessage[] = [];
  const clients = new Set<ServerWebSocket<undefined>>();
  const server: Server<undefined> = Bun.serve<undefined>({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (req, srv) => (srv.upgrade(req) ? undefined : new Response('ws', { status: 426 })),
    websocket: {
      open: (ws) => void clients.add(ws),
      close: (ws) => void clients.delete(ws),
      message: (_ws, raw) => {
        const m = parseClientMessage(String(raw));
        if (m !== null) {
          received.push(m);
        }
      },
    },
  });
  const ready = async (): Promise<void> => {
    const end = Date.now() + 5000;
    while (clients.size === 0) {
      if (Date.now() > end) {
        throw new Error('карта не подключилась к серверу трансляции');
      }
      await Bun.sleep(10);
    }
  };
  streamClient.retarget(() => Promise.resolve(`ws://127.0.0.1:${server.port}/`));
  return {
    received,
    postsTo: (key) => received.flatMap((m) => (m.t === 'post' && m.key === key ? [m.data] : [])),
    ready,
    page: async (key, data) => {
      await ready();
      for (const c of clients) {
        c.send(JSON.stringify({ t: 'page', key, data }));
      }
    },
    stop: () => {
      // Клиент вкладки больше не ищет сервер теста
      streamClient.retarget(() => Promise.resolve(null));
      void server.stop(true);
    },
  };
}
