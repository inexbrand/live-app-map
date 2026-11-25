/**
 * Порт dev-сервера визуализатора под Bun. Если порт занят, vite без strictPort
 * переходит на соседний, но под Bun его listen() не завершается, а сервер
 * держит прежние порты до конца процесса: после череды перезапусков процесс
 * занимает сотни портов. Занятый порт должен давать ошибку сразу.
 */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

const spaRoot = path.resolve(import.meta.dir, '../..');
const WAIT_MS = 8000;

let scratch = '';
let holder: ReturnType<typeof Bun.serve> | null = null;
let vite: ViteDevServer | null = null;

/** Свободный порт: занять нулевой и сразу отпустить. */
function freePort(): number {
  const s = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = s.port ?? 0;
  void s.stop(true);
  return port;
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'lam-port-'));
  // Шлюз и трансляция плагинов — на своих портах, не на общих 4320/4321
  process.env['LAM_GATEWAY_PORT'] = String(freePort());
  process.env['LAM_STREAM_PORT'] = String(freePort());
  process.env['LAM_SESSIONS_DIR'] = path.join(scratch, 'sessions');
});

afterEach(async () => {
  await vite?.close();
  vite = null;
  await holder?.stop(true);
  holder = null;
  rmSync(scratch, { recursive: true, force: true });
});

test('занятый порт: dev-сервер сразу падает с понятной ошибкой, соседний порт не занимает', async () => {
  holder = Bun.serve({ port: 0, hostname: '0.0.0.0', fetch: () => new Response('занят') });
  const port = holder.port ?? 0;
  vite = await createServer({ configFile: path.join(spaRoot, 'vite.config.ts'), root: spaRoot, logLevel: 'silent', server: { port } });
  const outcome = await Promise.race([
    vite.listen().then(
      () => 'запустился',
      (e: unknown) => String(e),
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('завис'), WAIT_MS)),
  ]);
  expect(outcome).toContain(`Port ${port} is already in use`);
  // соседний порт свободен: сервер его не занял
  const next = Bun.serve({ port: port + 1, hostname: '0.0.0.0', fetch: () => new Response('') });
  await next.stop(true);
}, 30_000);
