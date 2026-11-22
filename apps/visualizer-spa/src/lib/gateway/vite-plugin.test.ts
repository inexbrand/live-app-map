/**
 * Плагин шлюза на поддельном dev-сервере vite (журнал, middlewares, httpServer):
 * шлюз поднимается на свободном порту, REST профилей подключается, перезапуск
 * vite закрывает прежний шлюз, закрытие сервера — шлюз.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { lamGatewayPlugin } from './vite-plugin';

const env = { sessions: process.env['LAM_SESSIONS_DIR'], port: process.env['LAM_GATEWAY_PORT'] };
let busy: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  process.env['LAM_SESSIONS_DIR'] = mkdtempSync(path.join(tmpdir(), 'lam-plugin-sessions-'));
  // Занятый порт: шлюз должен уйти на следующий
  busy = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('занято') });
  process.env['LAM_GATEWAY_PORT'] = String(busy.port);
});

afterAll(() => {
  void busy.stop(true);
  for (const [k, v] of [['LAM_SESSIONS_DIR', env.sessions], ['LAM_GATEWAY_PORT', env.port]] as const) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

type FakeServer = { server: object; lines: string[]; used: unknown[]; http: EventEmitter };

/** Dev-сервер vite в той части, которой пользуется плагин. */
function fakeServer(): FakeServer {
  const lines: string[] = [];
  const used: unknown[] = [];
  const http = new EventEmitter();
  const logger = { info: (l: string) => lines.push(`info ${l}`), warn: (l: string) => lines.push(`warn ${l}`), error: (l: string) => lines.push(`error ${l}`) };
  const server = { config: { logger }, middlewares: { use: (m: unknown) => used.push(m) }, httpServer: http };
  return { server, lines, used, http };
}

function configure(plugin: Plugin, s: FakeServer): void {
  const hook = plugin.configureServer;
  const fn = typeof hook === 'function' ? hook : hook?.handler;
  if (fn !== undefined) {
    Reflect.apply(fn, undefined, [s.server]);
  }
}

async function answers(port: number): Promise<number> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/`)).status;
  } catch {
    return 0;
  }
}

describe('lamGatewayPlugin', () => {
  test('шлюз на следующем свободном порту, профили и снимки подключены; закрытие vite — шлюз закрыт', async () => {
    const s = fakeServer();
    configure(lamGatewayPlugin(), s);
    const next = (busy.port ?? 0) + 1;
    expect(s.lines.some((l) => l.includes(`.localhost:${next}/`))).toBe(true);
    expect(s.used).toHaveLength(2);
    expect(await answers(next)).toBe(404);
    s.http.emit('close');
    await Bun.sleep(50);
    expect(await answers(next)).toBe(0);
  });

  test('перезапуск vite: прежний шлюз закрывается, новый встаёт на тот же порт', async () => {
    const first = fakeServer();
    configure(lamGatewayPlugin(), first);
    const second = fakeServer();
    configure(lamGatewayPlugin(), second);
    const next = (busy.port ?? 0) + 1;
    expect(second.lines.some((l) => l.includes(`.localhost:${next}/`))).toBe(true);
    second.http.emit('close');
    await Bun.sleep(50);
  });
});