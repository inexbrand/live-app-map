/**
 * Сервер трансляции: настоящий WebSocket и headless-браузер.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { launchStreamBrowser } from '../gateway/snapshot-browser';
import { decodeFrame, type ClientMessage } from './stream-protocol';
import { startStreamServer, type StreamServer } from './stream-server';

let app: Server<undefined>;
/** Страница, которая меняется каждые 100 мс: кадры идут, пока она открыта. */
const TICK_PAGE = '<body><script>let n=0;setInterval(()=>{document.body.style.background=(n++%2)?"#fff":"#eee"},100)</script>';
let stream: StreamServer;

type Inbox = { readonly ws: WebSocket; readonly frames: string[]; readonly texts: unknown[] };

function connect(): Promise<Inbox> {
  const ws = new WebSocket(`ws://127.0.0.1:${stream.port}/`);
  ws.binaryType = 'arraybuffer';
  const box: Inbox = { ws, frames: [], texts: [] };
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') {
      box.texts.push(JSON.parse(e.data));
      return;
    }
    const f = decodeFrame(new Uint8Array(e.data as ArrayBuffer));
    if (f !== null) {
      box.frames.push(f.key);
    }
  };
  return new Promise((resolve) => (ws.onopen = () => resolve(box)));
}

async function until(cond: () => boolean): Promise<void> {
  const end = Date.now() + 15_000;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error('не дождались');
    }
    await Bun.sleep(50);
  }
}

const send = (box: Inbox, m: ClientMessage): void => box.ws.send(JSON.stringify(m));

beforeAll(() => {
  app = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (req) => new URL(req.url).pathname === '/tick' ? new Response(TICK_PAGE, { headers: { 'content-type': 'text/html' } }) : new Response('<body style="background:#fff"><script>parent.postMessage({lam:"page",href:location.href},"*")</script>', { headers: { 'content-type': 'text/html' } }) });
  stream = startStreamServer({ port: 0, launch: launchStreamBrowser, idleCloseMs: 100 });
});

afterAll(async () => {
  await stream.stop();
  void app.stop(true);
});

describe('сервер трансляции', () => {
  test('карта задаёт набор — получает кадры и отчёт страницы; вторая карта сразу получает последний кадр', async () => {
    const a = await connect();
    send(a, { t: 'sync', screens: [{ key: 'n1', url: `http://127.0.0.1:${app.port}/`, width: 320, height: 200, live: true }] });
    await until(() => a.frames.includes('n1') && a.texts.some((t) => JSON.stringify(t).includes('"key":"n1"')));
    const b = await connect();
    await until(() => b.frames.includes('n1'));
    a.ws.close();
    b.ws.close();
  }, 30_000);

  test('две карты: набор второй не закрывает экраны первой', async () => {
    const a = await connect();
    const b = await connect();
    send(a, { t: 'sync', screens: [{ key: 'a1', url: `http://127.0.0.1:${app.port}/tick`, width: 320, height: 200, live: true }] });
    await until(() => a.frames.includes('a1'));
    send(b, { t: 'sync', screens: [{ key: 'b1', url: `http://127.0.0.1:${app.port}/tick?b`, width: 320, height: 200, live: true }] });
    await until(() => b.frames.includes('b1'));
    // Страница первой карты жива: её кадры продолжают приходить
    const before = a.frames.filter((k) => k === 'a1').length;
    await until(() => a.frames.filter((k) => k === 'a1').length > before + 3);
    // Первая карта ушла — её экран закрывается, экран второй остаётся
    a.ws.close();
    await Bun.sleep(500);
    const bBefore = b.frames.filter((k) => k === 'b1').length;
    await until(() => b.frames.filter((k) => k === 'b1').length > bBefore + 3);
    b.ws.close();
  }, 30_000);

  test('мусор от карты не роняет сервер', async () => {
    const c = await connect();
    c.ws.send('{не json');
    c.ws.send(JSON.stringify({ t: 'input', key: 'нет такого', input: { kind: 'key', type: 'down', key: 'Enter' } }));
    send(c, { t: 'sync', screens: [] });
    await Bun.sleep(200);
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    c.ws.close();
  }, 30_000);
});
