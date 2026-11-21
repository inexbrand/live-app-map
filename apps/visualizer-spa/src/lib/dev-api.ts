/**
 * Один клиент JSON-эндпоинтов dev-сервера визуализатора (`/api/*`, `/__lam_*`)
 * для браузера: запрос, разбор JSON, текст ошибки из `{ error }` ответа.
 * Не бросает: сеть, неверный JSON и ответ не-2xx приходят как `ok: false`.
 */

/** Ответ эндпоинта: тело 2xx или ошибка с кодом (null — сеть или неверный JSON). */
export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly value: T }
  | { readonly ok: false; readonly status: number | null; readonly error: string; readonly body: unknown };

/** Параметры запроса. */
export type ApiRequest = {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Тело: уходит JSON-ом с content-type. */
  readonly json?: unknown;
  readonly cache?: RequestCache;
  /** fetch (подменяется в тестах). */
  readonly fetchFn?: typeof fetch;
};

/**
 * Текст `error` из JSON-тела ответа или null.
 *
 * @param body - тело ответа
 */
export function apiErrorText(body: unknown): string | null {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : null;
}

/**
 * Поле JSON-объекта, прошедшее проверку вида; иначе null.
 *
 * @param body - тело ответа
 * @param key - имя поля
 * @param check - проверка вида
 */
export function apiField<T>(body: unknown, key: string, check: (v: unknown) => v is T): T | null {
  const v = typeof body === 'object' && body !== null ? Object.entries(body).find(([k]) => k === key)?.[1] : undefined;
  return check(v) ? v : null;
}

/**
 * Текст пойманной ошибки.
 *
 * @param err - что поймали
 */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function init(req: ApiRequest): RequestInit {
  return {
    ...(req.method === undefined ? {} : { method: req.method }),
    ...(req.cache === undefined ? {} : { cache: req.cache }),
    ...(req.json === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.json) }),
  };
}

/**
 * Запрос к JSON-эндпоинту.
 *
 * @param url - адрес
 * @param req - метод, тело, кэш
 * @returns тело 2xx; иначе текст ошибки (`error` ответа или `HTTP <код>`) и тело как есть
 */
export async function requestJson(url: string, req: ApiRequest = {}): Promise<ApiResult<unknown>> {
  try {
    const res = await (req.fetchFn ?? fetch)(url, init(req));
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      return { ok: false, status: res.status, error: apiErrorText(body) ?? `HTTP ${res.status}`, body };
    }
    const value: unknown = await res.json();
    return { ok: true, status: res.status, value };
  } catch (err) {
    return { ok: false, status: null, error: errorText(err), body: null };
  }
}

/**
 * Тело ответа независимо от кода (для эндпоинтов, что кладут данные и в ошибку).
 *
 * @param r - результат requestJson
 */
export function anyBody(r: ApiResult<unknown>): unknown {
  return r.ok ? r.value : r.body;
}

/**
 * Отправка без чтения ответа: принят ли запрос (2xx).
 *
 * @param url - адрес
 * @param req - метод, тело
 * @returns false и при ошибке сети
 */
export async function requestOk(url: string, req: ApiRequest = {}): Promise<boolean> {
  try {
    return (await (req.fetchFn ?? fetch)(url, init(req))).ok;
  } catch {
    return false;
  }
}
