/**
 * Серия правок vite.config подряд: dev-сервер визуализатора переживает её на том же порту.
 * vite перезапускает сервер на каждую правку конфига; перезапуски не должны накладываться —
 * иначе следующий встаёт на ещё не освобождённый порт (strictPort → «Port N is already in use»).
 */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLogger, createServer, type ViteDevServer } from 'vite';

const spaRoot = path.resolve(import.meta.dir, '../..');

let scratch = '';
let vite: ViteDevServer | null = null;

/** Свободный порт: занять нулевой и сразу отпустить. */
function freePort(): number {
  const s = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = s.port ?? 0;
  void s.stop(true);
  return port;
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'lam-restart-'));
  process.env['LAM_GATEWAY_PORT'] = String(freePort());
  process.env['LAM_STREAM_PORT'] = String(freePort());
  process.env['LAM_SESSIONS_DIR'] = path.join(scratch, 'sessions');
});

afterEach(async () => {
  await vite?.close();
  vite = null;
  rmSync(scratch, { recursive: true, force: true });
});

/** Конфиг-обёртка во временной папке: её правка перезапускает только этот сервер, не общий :4310. */
function writeWrapper(file: string, n: number): void {
  const target = path.join(spaRoot, 'vite.config.ts').split(path.sep).join('/');
  writeFileSync(file, `// правка ${n}\nexport { default } from '${target}';\n`);
}

test('пять правок конфига подряд: сервер жив на том же порту, ошибок порта нет', async () => {
  const errors: string[] = [];
  const logger = createLogger('silent');
  logger.error = (msg) => {
    errors.push(msg);
  };
  const config = path.join(scratch, 'vite.config.mts');
  writeWrapper(config, 0);
  const port = freePort();
  vite = await createServer({ configFile: config, root: spaRoot, customLogger: logger, server: { port } });
  await vite.listen();
  for (let i = 1; i <= 5; i++) {
    writeWrapper(config, i);
    await Bun.sleep(120);
  }
  // Ждём, пока перезапуски закончатся: сервер отвечает и новых перезапусков нет.
  await Bun.sleep(8000);
  const res = await fetch(`http://127.0.0.1:${port}/`);
  expect(res.status).toBe(200);
  expect(errors.filter((e) => /already in use|EADDRINUSE|EBADF|restart failed/.test(e))).toEqual([]);
  // Соседний порт не занят: перебора нет.
  const next = Bun.serve({ port: port + 1, hostname: '0.0.0.0', fetch: () => new Response('') });
  await next.stop(true);
}, 60_000);
