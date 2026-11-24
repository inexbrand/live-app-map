/**
 * Поток изменений замечаний (SSE): одно наблюдение за папкой на все вкладки.
 * Событие `changed` без данных — клиент сам перечитывает список: так поток
 * не зависит от формата веток, а пачка записей сливается в одно событие.
 */
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

/** Пауза, за которую записи одной ветки сливаются в одно событие. */
const SETTLE_MS = 120;
/** Пустая строка-комментарий, чтобы прокси и браузер не закрыли тихое соединение. */
const HEARTBEAT_MS = 25_000;

type Hub = {
  readonly clients: Set<ServerResponse>;
  readonly watcher: FSWatcher;
  readonly heartbeat: ReturnType<typeof setInterval>;
};

const hubs = new Map<string, Hub>();

function broadcast(clients: ReadonlySet<ServerResponse>, chunk: string): void {
  for (const res of clients) {
    res.write(chunk);
  }
}

function openHub(lamDir: string): Hub {
  const dir = path.join(lamDir, 'comments');
  mkdirSync(dir, { recursive: true });
  const clients = new Set<ServerResponse>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(dir, { recursive: true }, () => {
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        broadcast(clients, 'event: changed\ndata: {}\n\n');
      }, SETTLE_MS);
    }
  });
  const heartbeat = setInterval(() => broadcast(clients, ': ping\n\n'), HEARTBEAT_MS);
  return { clients, watcher, heartbeat };
}

function closeHub(lamDir: string, hub: Hub): void {
  hub.watcher.close();
  clearInterval(hub.heartbeat);
  hubs.delete(lamDir);
}

/**
 * Подписывает ответ на изменения замечаний в папке обмена до закрытия соединения.
 *
 * @param res - ответ HTTP, станет потоком text/event-stream
 * @param lamDir - папка обмена
 */
export function streamCommentChanges(res: ServerResponse, lamDir: string): void {
  const hub = hubs.get(lamDir) ?? openHub(lamDir);
  hubs.set(lamDir, hub);
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('connection', 'keep-alive');
  // Первое событие сразу: клиент перечитает список после (пере)подключения
  res.write('event: ready\ndata: {}\n\n');
  hub.clients.add(res);
  // Обрыв — по «close» ответа: «close» запроса у GET приходит сразу
  res.on('close', () => {
    hub.clients.delete(res);
    if (hub.clients.size === 0) {
      closeHub(lamDir, hub);
    }
  });
}
