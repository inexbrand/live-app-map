/**
 * Сервис трансляции на настоящем headless-браузере: тестовая страница на Bun.serve.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { launchStreamBrowser } from '../gateway/snapshot-browser';
import type { StreamScreen } from './stream-protocol';
import { StreamService } from './stream-service';

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
<button id="b" style="position:absolute;left:10px;top:10px;width:200px;height:60px">жми</button>
<input id="i" style="position:absolute;left:10px;top:100px;width:200px;height:30px">
<script>
parent.postMessage({ lam: 'page', href: location.href }, '*');
document.getElementById('b').addEventListener('click', function () { document.body.style.background = '#0a0'; parent.postMessage({ lam: 'page', clicked: true }, '*'); });
document.getElementById('i').addEventListener('input', function (e) { parent.postMessage({ lam: 'page', value: e.target.value }, '*'); });
addEventListener('message', function (e) { if (e.data && e.data.lam === 'ping') parent.postMessage({ lam: 'page', pong: true }, '*'); });
</script></body></html>`;

let app: Server<undefined>;
let service: StreamService;
const frames = new Map<string, number>();
const messages: { key: string; data: unknown }[] = [];

function screen(key: string, live: boolean): StreamScreen {
  return { key, url: `http://127.0.0.1:${app.port}/${key}`, width: 400, height: 300, live };
}

async function until(cond: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error('не дождались');
    }
    await Bun.sleep(50);
  }
}

const got = (key: string, pred: (d: Record<string, unknown>) => boolean): boolean =>
  messages.some((m) => m.key === key && typeof m.data === 'object' && m.data !== null && pred(m.data as Record<string, unknown>));

beforeAll(() => {
  app = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
  service = new StreamService({
    launch: launchStreamBrowser,
    onFrame: (key, jpeg) => {
      expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
      frames.set(key, (frames.get(key) ?? 0) + 1);
    },
    onPageMessage: (key, data) => messages.push({ key, data }),
  });
});

afterAll(async () => {
  await service.close();
  void app.stop(true);
});

describe('StreamService', () => {
  test('живой экран шлёт кадры; отчёт страницы доходит с ключом; команда карты — в страницу', async () => {
    await service.sync([screen('a', true)]);
    await until(() => (frames.get('a') ?? 0) > 0 && got('a', (d) => typeof d['href'] === 'string'));
    await service.post('a', { lam: 'ping' });
    await until(() => got('a', (d) => d['pong'] === true));
    // команды карты страница не отражает обратно
    expect(got('a', (d) => d['lam'] === 'ping')).toBe(false);
  }, 30_000);

  test('клик и ввод текста доходят: страница меняется и присылает новый кадр', async () => {
    const before = frames.get('a') ?? 0;
    await service.input('a', { kind: 'mouse', type: 'down', x: 50, y: 30, button: 'left', clickCount: 1 });
    await service.input('a', { kind: 'mouse', type: 'up', x: 50, y: 30, button: 'left', clickCount: 1 });
    await until(() => got('a', (d) => d['clicked'] === true) && (frames.get('a') ?? 0) > before);
    await service.input('a', { kind: 'mouse', type: 'down', x: 60, y: 115, button: 'left', clickCount: 1 });
    await service.input('a', { kind: 'mouse', type: 'up', x: 60, y: 115, button: 'left', clickCount: 1 });
    for (const key of ['п', 'r', 'и']) {
      await service.input('a', { kind: 'key', type: 'down', key });
      await service.input('a', { kind: 'key', type: 'up', key });
    }
    await until(() => got('a', (d) => d['value'] === 'пrи'));
  }, 30_000);

  test('не живой — кадров нет, последний кадр остаётся; вне набора — страница закрыта', async () => {
    await service.sync([screen('a', false)]);
    await Bun.sleep(300);
    const paused = frames.get('a') ?? 0;
    await service.post('a', { lam: 'ping' });
    await Bun.sleep(600);
    expect(frames.get('a') ?? 0).toBe(paused);
    expect(service.lastFrames().has('a')).toBe(true);
    await service.sync([]);
    expect(service.openKeys()).toEqual([]);
    expect(service.lastFrames().has('a')).toBe(true);
  }, 30_000);
});
