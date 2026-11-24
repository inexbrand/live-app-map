/**
 * Подмена ответов API в странице по состоянию из `.live-app-map/states.ts`.
 *
 * Функции встраиваются в страницу текстом (toString): без импортов значений и
 * замыканий, друг друга зовут по имени.
 */
import type { LamApiOverride } from '../project';

/** Что просит адрес: состояние экрана или вариант компонента. */
export type LamStateRef = { readonly kind: 'screen' | 'component'; readonly target: string; readonly state: string };

/** Описание состояния, которое отдаёт плагин (GET /@lam/state). */
export type LamStatePayload = { readonly id: string; readonly label?: string; readonly api?: Readonly<Record<string, LamApiOverride>> };

/**
 * Разбор id состояния: «<id экрана>/<id состояния>» или «component:<ключ>/<вариант>».
 * Id экрана и ключ компонента сами содержат «/», поэтому делим по последнему.
 *
 * @param raw - значение lam_state
 * @returns ссылка или null, если формат не тот
 */
export function lamParseStateId(raw: string): LamStateRef | null {
  const slash = raw.lastIndexOf('/');
  if (slash <= 0 || slash === raw.length - 1) {
    return null;
  }
  const head = raw.slice(0, slash);
  const state = raw.slice(slash + 1);
  if (head.indexOf('component:') === 0) {
    const key = head.slice('component:'.length);
    return key === '' ? null : { kind: 'component', target: key, state };
  }
  return { kind: 'screen', target: head, state };
}

/**
 * Id состояния страницы: параметр адреса, иначе sessionStorage (шлюз визуализатора
 * кладёт туда), иначе страница компонента `/@lam/component?key=&variant=`.
 *
 * @param href - адрес страницы
 * @param stored - значение sessionStorage[param] или null
 * @param param - имя параметра (lam_state)
 */
export function lamStateIdFromPage(href: string, stored: string | null, param: string): string | null {
  const url = new URL(href);
  const fromQuery = url.searchParams.get(param);
  if (fromQuery !== null && fromQuery !== '') {
    return fromQuery;
  }
  if (stored !== null && stored !== '') {
    return stored;
  }
  const key = url.searchParams.get('key');
  const variant = url.searchParams.get('variant');
  if (url.pathname === '/@lam/component' && key !== null && key !== '' && variant !== null && variant !== '') {
    return 'component:' + key + '/' + variant;
  }
  return null;
}

/**
 * Совпадает ли запрос с ключом «МЕТОД /путь»; сегмент `:имя` — любой непустой.
 *
 * @param key - ключ из states.ts: `GET /api/v1/vacancies/:id`
 * @param method - метод запроса
 * @param pathname - путь запроса без query
 */
export function lamMatchApiKey(key: string, method: string, pathname: string): boolean {
  const sp = key.indexOf(' ');
  if (sp <= 0 || key.slice(0, sp).toUpperCase() !== method.toUpperCase()) {
    return false;
  }
  const want = key.slice(sp + 1).trim().split('?')[0]?.split('/') ?? [];
  const got = pathname.split('/');
  if (want.length !== got.length) {
    return false;
  }
  for (let i = 0; i < want.length; i++) {
    const w = want[i] ?? '';
    const g = got[i] ?? '';
    if (w.charAt(0) === ':' ? g === '' : w !== g) {
      return false;
    }
  }
  return true;
}

/**
 * Подмена для запроса: первый совпавший ключ состояния.
 *
 * @param api - подмены состояния
 * @param method - метод
 * @param url - адрес запроса (относительный — от base)
 * @param base - адрес страницы
 */
export function lamFindOverride(api: Readonly<Record<string, LamApiOverride>>, method: string, url: string, base: string): LamApiOverride | null {
  let pathname = '';
  try {
    pathname = new URL(url, base).pathname;
  } catch (e) {
    return null;
  }
  const keys = Object.keys(api);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] ?? '';
    const o = api[k];
    if (o !== undefined && lamMatchApiKey(k, method, pathname)) {
      return o;
    }
  }
  return null;
}

/** Тело и тип подменного ответа: строка — как есть (text/plain), остальное — JSON. */
export function lamBodyOf(o: { readonly status: number; readonly body?: unknown }): { readonly text: string | null; readonly type: string } {
  if (o.body === undefined || o.status === 204 || o.status === 304) {
    return { text: null, type: 'application/json' };
  }
  return typeof o.body === 'string' ? { text: o.body, type: 'text/plain; charset=utf-8' } : { text: JSON.stringify(o.body), type: 'application/json' };
}

/**
 * Подменный ответ fetch: с задержкой delayMs; 'pending' — не приходит никогда
 * (отмена через signal — AbortError, как у настоящего fetch).
 */
export function lamFakeResponse(o: LamApiOverride, signal: AbortSignal | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal !== null) {
      if (signal.aborted) {
        reject(new DOMException('Запрос отменён', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => reject(new DOMException('Запрос отменён', 'AbortError')));
    }
    if (o === 'pending') {
      return;
    }
    const b = lamBodyOf(o);
    const make = (): void => resolve(new Response(b.text, { status: o.status, headers: { 'content-type': b.type, 'x-lam-state': '1' } }));
    if (o.delayMs !== undefined && o.delayMs > 0) {
      setTimeout(make, o.delayMs);
    } else {
      make();
    }
  });
}

/** Сигнатура fetch страницы (без расширений Bun вроде preconnect). */
export type LamFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Метод и адрес аргументов fetch. */
export function lamFetchTarget(input: RequestInfo | URL, init: RequestInit | undefined): { readonly method: string; readonly url: string } {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request;
  const url = typeof input === 'string' ? input : isRequest ? (input as Request).url : String(input);
  const method = init !== undefined && typeof init.method === 'string' ? init.method : isRequest ? (input as Request).method : 'GET';
  return { method: method.toUpperCase(), url };
}

/**
 * Подменяет window.fetch: ждёт описание состояния, совпавший ключ — подменный
 * ответ, остальное — настоящий запрос.
 *
 * @param w - окно страницы
 * @param state - описание состояния (null — подмен нет)
 * @param original - настоящий fetch
 */
export function lamPatchFetch(w: Window, state: Promise<LamStatePayload | null>, original: LamFetch): void {
  w.fetch = function lamFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const t = lamFetchTarget(input, init);
    return state.then((s) => {
      const o = s === null || s.api === undefined ? null : lamFindOverride(s.api, t.method, t.url, w.location.href);
      if (o === null) {
        return original.call(w, input, init);
      }
      const signal = init !== undefined && init.signal !== undefined && init.signal !== null ? init.signal : null;
      return lamFakeResponse(o, signal);
    });
  };
}

/** Запрос XHR, запомненный в open. */
export type LamXhrRequest = { readonly method: string; readonly url: string; readonly async: boolean };

/** Ответ XHR из подмены: поля чтения подменяются на экземпляре, события — как у настоящего. */
export function lamFakeXhr(xhr: XMLHttpRequest, o: { readonly status: number; readonly body?: unknown; readonly delayMs?: number }): void {
  const b = lamBodyOf(o);
  const finish = (): void => {
    let parsed: unknown = b.text;
    if (xhr.responseType === 'json') {
      try {
        parsed = b.text === null ? null : JSON.parse(b.text);
      } catch (e) {
        parsed = null;
      }
    }
    const fields: Record<string, unknown> = { readyState: 4, status: o.status, statusText: o.status < 400 ? 'OK' : 'Error', responseText: b.text === null ? '' : b.text, response: parsed, responseURL: '' };
    const names = Object.keys(fields);
    for (let i = 0; i < names.length; i++) {
      const name = names[i] ?? '';
      Object.defineProperty(xhr, name, { configurable: true, value: fields[name] });
    }
    Object.defineProperty(xhr, 'getResponseHeader', { configurable: true, value: (h: string) => (h.toLowerCase() === 'content-type' ? b.type : null) });
    Object.defineProperty(xhr, 'getAllResponseHeaders', { configurable: true, value: () => 'content-type: ' + b.type + '\r\n' });
    xhr.dispatchEvent(new Event('readystatechange'));
    xhr.dispatchEvent(new ProgressEvent('load'));
    xhr.dispatchEvent(new ProgressEvent('loadend'));
  };
  if (o.delayMs !== undefined && o.delayMs > 0) {
    setTimeout(finish, o.delayMs);
  } else {
    setTimeout(finish, 0);
  }
}

/**
 * Подменяет XMLHttpRequest (open/send в прототипе): асинхронный запрос с
 * совпавшим ключом получает подменный ответ, 'pending' — не завершается.
 *
 * @param w - окно страницы
 * @param state - описание состояния
 */
export function lamPatchXhr(w: Window & { readonly XMLHttpRequest: typeof XMLHttpRequest }, state: Promise<LamStatePayload | null>): void {
  const proto = w.XMLHttpRequest.prototype;
  const open = proto.open;
  const send = proto.send;
  const reqs = new WeakMap<XMLHttpRequest, LamXhrRequest>();
  proto.open = function lamOpen(this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null): void {
    reqs.set(this, { method: method.toUpperCase(), url: String(url), async: async !== false });
    if (arguments.length <= 2) {
      open.call(this, method, url, true);
      return;
    }
    open.call(this, method, url, async !== false, user, password);
  };
  proto.send = function lamSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const xhr = this;
    const req = reqs.get(xhr);
    if (req === undefined || !req.async) {
      send.call(xhr, body);
      return;
    }
    state.then((s) => {
      const o = s === null || s.api === undefined ? null : lamFindOverride(s.api, req.method, req.url, w.location.href);
      if (o === null) {
        send.call(xhr, body);
      } else if (o !== 'pending') {
        lamFakeXhr(xhr, o);
      }
    });
  };
}
