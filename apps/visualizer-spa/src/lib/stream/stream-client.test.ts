/**
 * Клиент трансляции против настоящего сервера и headless-браузера.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { launchStreamBrowser } from '../gateway/snapshot-browser';
import { StreamClient } from './stream-client';
import { startStreamServer, type StreamServer } from './stream-server';

let app: Server<undefined>;
let stream: StreamServer;
let client: StreamClient;

async function until(cond: () => boolean): Promise<void> {
  const end = Date.now() + 15_000;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error('не дождались');
    }
    await Bun.sleep(50);
  }
}

beforeAll(() => {
  app = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () =>
      new Response('<body style="background:#fff"><script>parent.postMessage({lam:"page",href:location.href},"*");addEventListener("message",function(e){if(e.data&&e.data.lam==="ping")parent.postMessage({lam:"page",pong:1},"*")})</script>', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  stream = startStreamServer({ port: 0, launch: launchStreamBrowser });
  client = new StreamClient(() => Promise.resolve(`ws://127.0.0.1:${stream.port}/`));
});

afterAll(async () => {
  client.close();
  await stream.stop();
  void app.stop(true);
});

describe('StreamClient', () => {
  test('набор экранов → кадры подписчику и последний кадр; сообщения страницы и ответ на post', async () => {
    const frames: Blob[] = [];
    const pages: unknown[] = [];
    client.onFrame('k', (b) => frames.push(b));
    client.onPageMessage((key, data) => pages.push({ key, data }));
    client.sync([{ key: 'k', url: `http://127.0.0.1:${app.port}/`, width: 300, height: 200, live: true }]);
    await until(() => frames.length > 0 && pages.length > 0);
    expect(frames[0]?.type).toBe('image/jpeg');
    expect(client.lastFrame('k')).toBe(frames.at(-1) ?? null);
    client.post('k', { lam: 'ping' });
    await until(() => JSON.stringify(pages).includes('"pong":1'));
    expect(JSON.stringify(pages[0])).toContain('"key":"k"');
  }, 30_000);

  test('без кадров адреса картинки нет', () => {
    expect(client.frameUrl('нет')).toBeNull();
  });
});
