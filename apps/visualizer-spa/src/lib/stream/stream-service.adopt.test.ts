/**
 * Вкладки трансляции переживают перезапуск сервиса: постоянный headless-браузер,
 * новый сервис того же владельца (тот же список вкладок) подхватывает их без
 * перехода, чужие вкладки не трогает. Настоящий браузер и тестовая страница на Bun.serve.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'bun';
import { chromium } from '@playwright/test';
import { launchStreamBrowser, streamCdpPort } from './stream-browser';
import type { StreamScreen } from './stream-protocol';
import { StreamService } from './stream-service';

const PAGE = `<!doctype html><html><body style="margin:0;background:#0a0"><div id="d">готово</div>
<script>parent.postMessage({ lam: 'page', href: location.href }, '*');
addEventListener('message', function (e) { if (e.data && e.data.lam === 'ping') parent.postMessage({ lam: 'page', pong: true }, '*'); });</script></body></html>`;

let app: Server<undefined>;
let dir: string;
/** Сколько раз сервер отдал каждый путь: подхват без перехода страницу не запрашивает. */
const hits = new Map<string, number>();

type Probe = { readonly frames: Map<string, number>; readonly messages: { key: string; data: unknown }[]; readonly steps: { key: string; error: string | null }[] };

function service(tabsFile: string | undefined, probe: Probe): StreamService {
  return new StreamService({
    launch: launchStreamBrowser,
    tabsFile,
    onFrame: (key) => probe.frames.set(key, (probe.frames.get(key) ?? 0) + 1),
    onPageMessage: (key, data) => probe.messages.push({ key, data }),
    onSteps: (key, error) => probe.steps.push({ key, error }),
  });
}

const probe = (): Probe => ({ frames: new Map(), messages: [], steps: [] });
const screen = (key: string): StreamScreen => ({ key, url: `http://127.0.0.1:${app.port}/${key}`, width: 320, height: 200, live: true });
const pong = (p: Probe, key: string): boolean => p.messages.some((m) => m.key === key && JSON.stringify(m.data).includes('"pong":true'));

async function until(cond: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error('не дождались');
    }
    await Bun.sleep(50);
  }
}

/** Адреса вкладок браузера трансляции — снаружи, отдельным подключением по CDP. */
async function openUrls(): Promise<string[]> {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${streamCdpPort(process.env)}`);
  const urls = (b.contexts()[0]?.pages() ?? []).map((p) => p.url());
  await b.close();
  return urls;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lam-tabs-'));
  app = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (req) => {
      const p = new URL(req.url).pathname;
      hits.set(p, (hits.get(p) ?? 0) + 1);
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });
});

afterAll(() => {
  void app.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('StreamService: постоянный браузер', () => {
  test('новый сервис подхватывает вкладки своего владельца без перехода, лишние свои закрывает, чужие не трогает', async () => {
    const mine = path.join(dir, 'mine.json');
    const pa = probe();
    const a = service(mine, pa);
    await a.sync([screen('x1'), screen('y1')]);
    await until(() => (pa.frames.get('x1') ?? 0) > 0 && (pa.frames.get('y1') ?? 0) > 0);
    // Чужой владелец со своей вкладкой
    const po = probe();
    const other = service(path.join(dir, 'other.json'), po);
    await other.sync([screen('z1')]);
    await until(() => (po.frames.get('z1') ?? 0) > 0);
    // Сервис уходит (перезапуск vite): браузер и вкладки остаются
    await a.close();
    expect((await openUrls()).filter((u) => u === screen('x1').url || u === screen('y1').url)).toHaveLength(2);

    const hitsBefore = hits.get('/x1') ?? 0;
    const pb = probe();
    const b = service(mine, pb);
    const t0 = Date.now();
    await b.sync([screen('x1')]);
    await until(() => (pb.frames.get('x1') ?? 0) > 0);
    const firstFrameMs = Date.now() - t0;
    // Без перехода: новый сервис страницу x1 не запрашивал
    expect(hits.get('/x1') ?? 0).toBe(hitsBefore);
    // Мост страницы → карта работает и на подхваченной вкладке
    await b.post('x1', { lam: 'ping' });
    await until(() => pong(pb, 'x1'));
    const urls = await openUrls();
    expect(urls.includes(screen('y1').url)).toBe(false);
    expect(urls.includes(screen('z1').url)).toBe(true);
    expect(firstFrameMs).toBeLessThan(3000);

    await b.sync([]);
    await b.close();
    await other.sync([]);
    await other.close();
  }, 60_000);

  test('экран-состояние: подхват без перехода, итог шагов прошлого сервиса приходит снова', async () => {
    const mine = path.join(dir, 'steps.json');
    const st: StreamScreen = { ...screen('s1'), steps: [{ waitFor: '#d' }] };
    const pa = probe();
    const a = service(mine, pa);
    await a.sync([st]);
    await until(() => pa.steps.length > 0 && (pa.frames.get('s1') ?? 0) > 0);
    expect(pa.steps).toEqual([{ key: 's1', error: null }]);
    await a.close();
    const hitsBefore = hits.get('/s1') ?? 0;
    const pb = probe();
    const b = service(mine, pb);
    await b.sync([st]);
    await until(() => pb.steps.length > 0 && (pb.frames.get('s1') ?? 0) > 0);
    expect(pb.steps).toEqual([{ key: 's1', error: null }]);
    expect(hits.get('/s1') ?? 0).toBe(hitsBefore);
    await b.sync([]);
    await b.close();
  }, 60_000);

  test('close() отключается, а браузер живёт', async () => {
    const p1 = probe();
    const s1 = service(undefined, p1);
    await s1.sync([screen('w1')]);
    await until(() => (p1.frames.get('w1') ?? 0) > 0);
    await s1.sync([]);
    await s1.close();
    const before = await openUrls();
    expect(before.length).toBeGreaterThan(0);
  }, 60_000);
});
