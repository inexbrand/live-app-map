/**
 * Сервис трансляции на настоящем headless-браузере: тестовая страница на Bun.serve.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { decode } from 'jpeg-js';
import { launchStreamBrowser } from './stream-browser';
import type { StreamScreen } from './stream-protocol';
import { StreamService } from './stream-service';

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
<button id="b" style="position:absolute;left:10px;top:10px;width:200px;height:60px">жми</button>
<input id="i" style="position:absolute;left:10px;top:100px;width:200px;height:30px">
<script>
parent.postMessage({ lam: 'page', href: location.href, screenKey: window.__lamScreenKey }, '*');
document.getElementById('b').addEventListener('click', function () { document.body.style.background = '#0a0'; parent.postMessage({ lam: 'page', clicked: true }, '*'); });
document.getElementById('i').addEventListener('input', function (e) { parent.postMessage({ lam: 'page', value: e.target.value }, '*'); });
addEventListener('message', function (e) { if (e.data && e.data.lam === 'ping') parent.postMessage({ lam: 'page', pong: true }, '*'); });
</script></body></html>`;

/** Путь /late, не /slow: встроенный блокировщик Helium режет /slow. Белая до события load, зелёная после: load держит картинка, которую сервер отдаёт через 1,5 с. */
const SLOW_PAGE = `<!doctype html><html><body style="margin:0;background:#fff" onload="document.body.style.background='#0a0'">
<img src="/delay" width="1" height="1"></body></html>`;

let app: Server<undefined>;
let service: StreamService;
const frames = new Map<string, number>();
const firstFrame = new Map<string, Uint8Array>();
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
  app = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === '/delay') {
        await Bun.sleep(1500);
        return new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b]), { headers: { 'content-type': 'image/gif' } });
      }
      return new Response(path === '/b' ? SLOW_PAGE : PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });
  service = new StreamService({
    launch: launchStreamBrowser,
    onFrame: (key, jpeg) => {
      expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
      frames.set(key, (frames.get(key) ?? 0) + 1);
      if (!firstFrame.has(key)) {
        firstFrame.set(key, jpeg);
      }
    },
    onPageMessage: (key, data) => messages.push({ key, data }),
  });
});

afterAll(async () => {
  // Браузер постоянный: свои вкладки закрыть, затем отключиться
  await service.sync([]);
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

  test('вкладка помечена ключом экрана (window.__lamScreenKey) — и после перехода на другой адрес', async () => {
    await service.sync([screen('a', true), screen('k', true)]);
    await until(() => got('k', (d) => d['screenKey'] === 'k'));
    // Вкладка уходит на другой адрес сама (редирект приложения) — пометка остаётся
    await service.post('k', { lam: 'ping' });
    await service.sync([screen('a', true), { ...screen('k', true), url: `http://127.0.0.1:${app.port}/k2` }]);
    await until(() => got('k', (d) => typeof d['href'] === 'string' && String(d['href']).endsWith('/k2') && d['screenKey'] === 'k'));
    await service.sync([screen('a', true)]);
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

  test('кадры идут только после загрузки страницы: первый кадр — готовая страница, а не пустой белый документ', async () => {
    await service.sync([screen('b', true)]);
    await until(() => firstFrame.has('b'));
    // Пиксели — из самого JPEG: Helium с защитой от отпечатков отдаёт canvas белым
    const img = decode(firstFrame.get('b') ?? new Uint8Array(), { useTArray: true });
    const at = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
    const rgb = [img.data[at], img.data[at + 1], img.data[at + 2]];
    // #0a0 после load; белый (255,255,255) — кадр недогруженной страницы
    expect(rgb[1] ?? 0).toBeGreaterThan(120);
    expect(rgb[0] ?? 255).toBeLessThan(60);
    await service.sync([screen('a', true)]);
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
