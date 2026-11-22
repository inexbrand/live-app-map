/**
 * GET /__lam_tls_check?url=https://… — проверка, что локальный сервис отвечает
 * (self-signed TLS принимается на стороне сервера).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Ответ: код и JSON-тело. */
type JsonReply = { readonly status: number; readonly body: Record<string, unknown> };

/** Хосты, которые можно проверять: только локальные. */
function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === 'vite.localhost' || host.endsWith('.localhost');
}

/**
 * Адрес проверки из запроса или отказ: нет url, не URL, не http(s), не локальный хост.
 *
 * @param rawUrl - путь запроса с query
 * @returns адрес или ответ-отказ
 */
export function checkTarget(rawUrl: string): URL | JsonReply {
  const target = new URL(rawUrl, 'http://localhost').searchParams.get('url');
  if (!target) {
    return { status: 400, body: { ok: false, error: 'url required' } };
  }
  const parsed = URL.parse(target) ?? undefined;
  if (parsed === undefined) {
    return { status: 400, body: { ok: false, error: 'invalid url' } };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { status: 400, body: { ok: false, error: 'only http(s)' } };
  }
  return isAllowedHost(parsed.hostname) ? parsed : { status: 403, body: { ok: false, error: 'host not allowlisted' } };
}

/**
 * Запрос к адресу с таймаутом 5 с: ответил — ok и статус, ошибка — подсказка.
 *
 * @param parsed - проверяемый адрес
 * @returns ответ (всегда 200: итог — в поле ok)
 */
export async function probeTarget(parsed: URL): Promise<JsonReply> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    // Bun / undici-style: accept self-signed
    const init: RequestInit & { tls?: { rejectUnauthorized?: boolean } } = { method: 'GET', signal: ac.signal, tls: { rejectUnauthorized: false } };
    const r = await fetch(parsed.href, init);
    const https = parsed.protocol === 'https:';
    return {
      status: 200,
      body: {
        ok: true,
        status: r.status,
        protocol: parsed.protocol,
        host: parsed.host,
        selfSignedOk: https,
        message: https ? 'HTTPS доступен (self-signed accepted server-side)' : 'HTTP доступен',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 200,
      body: {
        ok: false,
        host: parsed.host,
        error: message.slice(0, 200),
        hint: 'Проверьте, что miniapp/admin запущен. Для self-signed в iframe включите TLS-proxy.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res: ServerResponse, reply: JsonReply): void {
  res.statusCode = reply.status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(reply.body));
}

/**
 * Middleware проверки TLS; чужие пути — дальше.
 *
 * @param req - запрос
 * @param res - ответ
 * @param next - следующий обработчик
 */
export async function tlsCheckMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  const rawUrl = req.url ?? '';
  if (!rawUrl.startsWith('/__lam_tls_check')) {
    next();
    return;
  }
  const target = checkTarget(rawUrl);
  sendJson(res, target instanceof URL ? await probeTarget(target) : target);
}
