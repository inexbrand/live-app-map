/**
 * Прототип трансляции экранов: headless Helium рендерит страницы, кадры
 * (Page.startScreencast) уходят по WebSocket на карту-холст. Клик с карты
 * повторяется в странице. Запуск: bun prototype/screencast/server.ts <screens.json> [сколько]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import type { ServerWebSocket } from 'bun';
import { resolveSnapshotBrowserPath } from '../../src/lib/gateway/snapshot-browser';

/** Экран: адрес и размер окна. */
type Screen = { readonly id: string; readonly url: string; readonly width: number; readonly height: number };

const screens = (JSON.parse(await Bun.file(process.argv[2] ?? '').text()) as Screen[]).slice(0, Number(process.argv[3] ?? 9999));
const port = Number(process.env['PORT'] ?? 4330);
const quality = Number(process.env['QUALITY'] ?? 70);
const browser = await chromium.launch({ executablePath: resolveSnapshotBrowserPath(process.env, existsSync), args: ['--ignore-certificate-errors', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const clients = new Set<ServerWebSocket<undefined>>();
const pages: Page[] = [];
let framesOut = 0;
/** Последний кадр экрана: новая карта получает всё сразу. */
const lastFrame: Uint8Array[] = [];
const framesPerPage: number[] = [];
let bytesOut = 0;

/** Кадр: 2 байта номера экрана + JPEG. */
function frameMessage(index: number, jpegBase64: string): Uint8Array {
  const jpeg = Buffer.from(jpegBase64, 'base64');
  const msg = new Uint8Array(2 + jpeg.length);
  msg[0] = index >> 8;
  msg[1] = index & 255;
  msg.set(jpeg, 2);
  return msg;
}

async function open(screen: Screen, index: number): Promise<void> {
  const page = await ctx.newPage();
  pages[index] = page;
  await page.setViewportSize({ width: screen.width, height: screen.height });
  const cdp: CDPSession = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    const msg = frameMessage(index, f.data);
    lastFrame[index] = msg;
    framesPerPage[index] = (framesPerPage[index] ?? 0) + 1;
    framesOut++;
    bytesOut += msg.length;
    for (const c of clients) {
      c.send(msg);
    }
  });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1 });
  await page.goto(screen.url, { waitUntil: 'commit', timeout: 30_000 }).catch(() => undefined);
}

for (let i = 0; i < screens.length; i += 4) {
  await Promise.all(screens.slice(i, i + 4).map((s, k) => open(s, i + k)));
}

Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      return server.upgrade(req) ? undefined : new Response('нужен WebSocket', { status: 400 });
    }
    if (url.pathname === '/screens.json') {
      return Response.json(screens.map((s) => ({ id: s.id, width: s.width, height: s.height })));
    }
    if (url.pathname === '/stats') {
      return Response.json({ framesOut, bytesOut, pages: pages.length, framesPerPage });
    }
    return new Response(Bun.file(path.join(import.meta.dir, 'client.html')));
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      for (const f of lastFrame) {
        if (f !== undefined) {
          ws.send(f);
        }
      }
    },
    close(ws) {
      clients.delete(ws);
    },
    message(_ws, data) {
      const m = JSON.parse(String(data)) as { readonly i: number; readonly x: number; readonly y: number; readonly wheel?: number };
      const page = pages[m.i];
      if (m.wheel === 0) {
        void page?.mouse.move(m.x, m.y).catch(() => undefined);
        return;
      }
      if (m.wheel !== undefined) {
        void page?.mouse.move(m.x, m.y).then(() => page.mouse.wheel(0, m.wheel ?? 0)).catch(() => undefined);
        return;
      }
      void page?.mouse.click(m.x, m.y).catch(() => undefined);
    },
  },
});
console.log(`трансляция: http://localhost:${port}/ экранов ${screens.length}`);
