/**
 * Шлюз живых экранов: `http://<профиль>--<цель>.localhost:<порт>/…` →
 * локальное приложение. Снимает запреты встраивания (X-Frame-Options, CSP),
 * подставляет куки профиля и ловит новые, переписывает Origin/Referer и
 * Location, вставляет в HTML скрипт шлюза, пробрасывает WebSocket (HMR).
 */
import type { Server, ServerWebSocket } from 'bun';
import { cookieHeaderFor, rewriteSetCookieForBrowser } from './cookie-jar';
import { parseGatewayHost, type GatewayTarget } from './gateway-host';
import { injectIntoHtml, injectScript } from './inject-script';
import type { SessionStore } from './session-store';

/** Заголовки ответа, которые шлюз не передаёт браузеру. */
const DROPPED_RESPONSE: ReadonlySet<string> = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
  'connection',
  'keep-alive',
]);

/** Заголовки запроса, которые не идут в приложение как есть. */
const DROPPED_REQUEST: ReadonlySet<string> = new Set(['host', 'cookie', 'accept-encoding', 'connection', 'upgrade', 'origin', 'referer']);

/** Состояние моста WebSocket. */
type WsData = { readonly url: string; readonly headers: Record<string, string>; readonly protocols: string[]; upstream?: WebSocket; queue: Array<string | ArrayBuffer | Uint8Array> };

/** Опции шлюза. */
export type GatewayOptions = {
  readonly port: number;
  readonly store: SessionStore;
  readonly log?: (line: string) => void;
};

/** Заменяет origin шлюза на origin приложения в значении заголовка. */
function toUpstream(value: string, gatewayOrigin: string, target: GatewayTarget): string {
  return value.startsWith(gatewayOrigin) ? `${target.origin}${value.slice(gatewayOrigin.length)}` : value;
}

/** Заголовки запроса к приложению: куки профиля, Origin/Referer приложения. */
function upstreamHeaders(req: Request, target: GatewayTarget, store: SessionStore, gatewayOrigin: string, path: string): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (!DROPPED_REQUEST.has(k.toLowerCase())) {
      out[k] = v;
    }
  });
  out['host'] = `${target.hostname}:${target.port}`;
  out['accept-encoding'] = 'identity';
  const origin = req.headers.get('origin');
  if (origin !== null) {
    out['origin'] = toUpstream(origin, gatewayOrigin, target);
  }
  const referer = req.headers.get('referer');
  if (referer !== null) {
    out['referer'] = toUpstream(referer, gatewayOrigin, target);
  }
  const jar = store.get(target.profile)?.cookies[target.origin] ?? [];
  const cookie = cookieHeaderFor(req.headers.get('cookie') ?? '', jar, path, Date.now());
  if (cookie !== '') {
    out['cookie'] = cookie;
  }
  return out;
}

/**
 * Обрабатывает HTTP-запрос к шлюзу.
 *
 * @param req - запрос
 * @param target - цель из Host
 * @param store - профили
 * @returns ответ приложения, подготовленный для iframe
 */
async function forward(req: Request, target: GatewayTarget, store: SessionStore): Promise<Response> {
  const url = new URL(req.url);
  const gatewayOrigin = `${url.protocol}//${req.headers.get('host') ?? url.host}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(`${target.origin}${url.pathname}${url.search}`, {
    method: req.method,
    headers: upstreamHeaders(req, target, store, gatewayOrigin, url.pathname),
    ...(hasBody ? { body: await req.arrayBuffer() } : {}),
    redirect: 'manual',
    tls: { rejectUnauthorized: false },
  });
  const setCookies = res.headers.getSetCookie();
  store.absorbSetCookies(target.profile, target.origin, setCookies);
  const headers = browserHeaders(res.headers, setCookies, target, gatewayOrigin);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html') && req.method === 'GET') {
    return htmlWithSession(res, headers, target, store);
  }
  return new Response(res.body, { status: res.status, headers });
}

/** Заголовки ответа браузеру: без служебных, Location и Set-Cookie — на шлюз, метка профиля. */
function browserHeaders(upstream: Headers, setCookies: readonly string[], target: GatewayTarget, gatewayOrigin: string): Headers {
  const headers = new Headers();
  upstream.forEach((v, k) => {
    if (!DROPPED_RESPONSE.has(k.toLowerCase())) {
      headers.set(k, k.toLowerCase() === 'location' ? v.replace(target.origin, gatewayOrigin) : v);
    }
  });
  for (const c of setCookies) {
    headers.append('set-cookie', rewriteSetCookieForBrowser(c));
  }
  headers.set('x-lam-gateway', target.profile);
  return headers;
}

/** HTML страницы: вход освежается, в страницу встраивается скрипт сессии профиля. */
async function htmlWithSession(res: Response, headers: Headers, target: GatewayTarget, store: SessionStore): Promise<Response> {
  const renewError = await store.ensureFresh(target.profile, target.origin);
  if (renewError !== null) {
    headers.set('x-lam-renew-error', encodeURIComponent(renewError.slice(0, 200)));
  }
  const profile = store.get(target.profile);
  const storage = profile?.storage[target.origin] ?? {};
  const hasSession = Object.keys(storage).length > 0 || (profile?.cookies[target.origin] ?? []).length > 0;
  const html = injectIntoHtml(await res.text(), injectScript(storage, target.profile, hasSession));
  return new Response(html, { status: res.status, headers });
}

/**
 * Запускает шлюз.
 *
 * @param opts - порт, профили, лог
 * @returns сервер Bun
 */
export function startGateway(opts: GatewayOptions): Server<WsData> {
  const log = opts.log ?? (() => undefined);
  return Bun.serve<WsData>({
    port: opts.port,
    hostname: '127.0.0.1',
    idleTimeout: 120,
    fetch: (req, server) => gatewayFetch(req, server, opts.store, log),
    websocket: { open: wsOpen, message: wsMessage, close: (ws: ServerWebSocket<WsData>) => ws.data.upstream?.close() },
  });
}

/** Запрос к шлюзу: WebSocket — апгрейд, иначе — к приложению; нет ответа — 502. */
async function gatewayFetch(req: Request, server: Server<WsData>, store: SessionStore, log: (line: string) => void): Promise<Response | undefined> {
  const target = parseGatewayHost(req.headers.get('host') ?? '');
  if (target === null) {
    return new Response('Это шлюз Live App Map: адрес вида http://<профиль>--<цель>.localhost:<порт>/', { status: 404 });
  }
  if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return server.upgrade(req, wsUpgrade(req, target, store)) ? undefined : new Response('upgrade failed', { status: 400 });
  }
  try {
    return await forward(req, target, store);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[lam-gateway] ${target.origin}: ${message}`);
    return new Response(`Приложение ${target.origin} не отвечает: ${message}`, { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

/** Данные соединения WebSocket: адрес приложения, заголовки профиля, подпротоколы. */
function wsUpgrade(req: Request, target: GatewayTarget, store: SessionStore): { data: WsData; headers?: Record<string, string> } {
  const url = new URL(req.url);
  const gatewayOrigin = `http://${req.headers.get('host') ?? url.host}`;
  const protocols = (req.headers.get('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  const headers = upstreamHeaders(req, target, store, gatewayOrigin, url.pathname);
  for (const h of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']) {
    delete headers[h];
  }
  const wsUrl = `${target.protocol === 'https:' ? 'wss:' : 'ws:'}//${target.hostname}:${target.port}${url.pathname}${url.search}`;
  return {
    data: { url: wsUrl, headers, protocols, queue: [] },
    ...(protocols[0] === undefined ? {} : { headers: { 'sec-websocket-protocol': protocols[0] } }),
  };
}

/** Браузер подключился: открыть соединение с приложением и связать их. */
function wsOpen(ws: ServerWebSocket<WsData>): void {
  const { url, headers, protocols } = ws.data;
  const upstream: WebSocket = Reflect.construct(WebSocket, [url, { headers, protocols, tls: { rejectUnauthorized: false } }]);
  upstream.binaryType = 'arraybuffer';
  upstream.addEventListener('open', () => {
    for (const m of ws.data.queue) {
      upstream.send(m);
    }
    ws.data.queue = [];
  });
  upstream.addEventListener('message', (e: MessageEvent) => {
    const d: unknown = e.data;
    if (typeof d === 'string' || d instanceof ArrayBuffer) {
      ws.send(d);
    }
  });
  upstream.addEventListener('close', () => ws.close());
  upstream.addEventListener('error', () => ws.close());
  ws.data.upstream = upstream;
}

/** Сообщение браузера — приложению; соединение ещё не открыто — в очередь. */
function wsMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): void {
  const payload = typeof message === 'string' ? message : new Uint8Array(message);
  const up = ws.data.upstream;
  if (up !== undefined && up.readyState === WebSocket.OPEN) {
    up.send(payload);
  } else {
    ws.data.queue.push(payload);
  }
}
