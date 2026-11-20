/**
 * Общие куски connect-middleware dev-сервера визуализатора (Node).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Middleware в стиле connect (vite `server.middlewares.use`). */
export type DevMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

/** Результат чтения тела запроса. */
export type BodyResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly status: number; readonly error: string };

/**
 * Путь запроса без query.
 *
 * @param req - запрос
 */
export function requestPath(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0] ?? '';
}

/**
 * Отправляет JSON-ответ.
 *
 * @param res - ответ
 * @param status - HTTP-код
 * @param body - тело
 */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Читает тело целиком, обрывая чтение сверх лимита (413).
 *
 * @param req - запрос
 * @param maxBytes - предел размера
 */
export function readBody(req: IncomingMessage, maxBytes: number): Promise<BodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (r: BodyResult): void => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // Сверх лимита — не копим, но дочитываем: оборванный сокет клиент
      // увидел бы как ECONNRESET вместо понятного 413
      if (size <= maxBytes) {
        chunks.push(chunk);
      }
    });
    req.on('end', () =>
      finish(
        size > maxBytes
          ? { ok: false, status: 413, error: `тело больше ${maxBytes} байт` }
          : { ok: true, text: Buffer.concat(chunks).toString('utf8') },
      ),
    );
    req.on('error', (err) => finish({ ok: false, status: 400, error: err.message }));
  });
}

/**
 * Разбирает JSON-тело.
 *
 * @param text - тело
 * @returns значение или null, если это не JSON
 */
export function parseJsonText(text: string): { readonly value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Запрос пришёл со страницы локального origin (или без Origin — curl, агент).
 * Защита от DNS rebinding: dev-сервер слушает все интерфейсы (`host: true`),
 * а эндпоинты пишут файлы.
 *
 * @param req - запрос
 */
export function isLocalOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined || origin === '') {
    return true;
  }
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
  } catch {
    return false;
  }
}
