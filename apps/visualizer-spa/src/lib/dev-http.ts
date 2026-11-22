/**
 * Общие куски connect-middleware dev-сервера визуализатора (Node).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodIssue, ZodType } from 'zod';

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

/**
 * Текст ошибки из пойманного значения.
 *
 * @param err - что поймали
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Отправляет JSON-ошибку `{ ok: false, error }`.
 *
 * @param res - ответ
 * @param status - HTTP-код
 * @param error - понятный текст
 */
export function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { ok: false, error });
}

/**
 * Отвечает 405 с заголовком allow.
 *
 * @param res - ответ
 * @param allow - разрешённые методы, например `GET, POST`
 * @param error - текст для клиента
 */
export function rejectMethod(res: ServerResponse, allow: string, error: string): void {
  res.setHeader('allow', allow);
  sendError(res, 405, error);
}

/** Текст первой ошибки схемы: `путь: сообщение`. */
function issuePathText(issues: readonly ZodIssue[]): string {
  const issue = issues[0];
  return `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'неверное тело'}`;
}

/**
 * Читает JSON-тело и проверяет схемой; при ошибке сам отвечает (413/400) и возвращает null.
 *
 * @param req - запрос
 * @param res - ответ
 * @param schema - схема тела
 * @param maxBytes - предел размера
 * @param issueText - текст ошибки схемы (по умолчанию `путь: сообщение`)
 */
export async function readValidJson<T>(
  req: IncomingMessage,
  res: ServerResponse,
  schema: ZodType<T>,
  maxBytes: number,
  issueText: (issues: readonly ZodIssue[]) => string = issuePathText,
): Promise<T | null> {
  const body = await readBody(req, maxBytes);
  if (!body.ok) {
    sendError(res, body.status, body.error);
    return null;
  }
  const parsed = schema.safeParse(parseJsonText(body.text)?.value);
  if (!parsed.success) {
    sendError(res, 400, issueText(parsed.error.issues));
    return null;
  }
  return parsed.data;
}

/**
 * Проверка «путь — это base или вложенный в него».
 *
 * @param base - корень эндпоинтов, например `/api/comments`
 */
export function underPath(base: string): (p: string) => boolean {
  return (p) => p === base || p.startsWith(`${base}/`);
}

/** Эндпоинт dev-сервера: какие пути его, как обработать, каким кодом ответить на исключение. */
export type DevEndpoint = {
  readonly matches: (path: string) => boolean;
  /** Код ответа, если обработчик бросил (ответ ещё не начат). */
  readonly errorStatus: number;
  readonly handle: (req: IncomingMessage, res: ServerResponse, path: string) => Promise<void>;
};

/**
 * Middleware одного эндпоинта: чужие пути — дальше, исключение — JSON-ошибка.
 *
 * @param endpoint - пути, обработчик и код ошибки
 */
export function endpointMiddleware(endpoint: DevEndpoint): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (!endpoint.matches(p)) {
      next();
      return;
    }
    void endpoint.handle(req, res, p).catch((err: unknown) => {
      if (!res.headersSent) {
        sendError(res, endpoint.errorStatus, errorMessage(err));
      }
    });
  };
}

/**
 * То же для эндпоинта, который пишет на диск: сначала проверка локального origin (403).
 *
 * @param endpoint - пути, обработчик и код ошибки
 */
export function localEndpointMiddleware(endpoint: DevEndpoint): DevMiddleware {
  return endpointMiddleware({
    ...endpoint,
    handle: async (req, res, p) => {
      if (!isLocalOrigin(req)) {
        sendError(res, 403, 'origin не локальный');
        return;
      }
      await endpoint.handle(req, res, p);
    },
  });
}
