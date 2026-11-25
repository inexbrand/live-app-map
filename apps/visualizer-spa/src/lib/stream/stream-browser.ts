/**
 * Постоянный браузер трансляции: один headless Helium живёт отдельно от vite
 * (отсоединённый процесс), профиль и дисковый кэш — в постоянной папке.
 * Визуализатор подключается к нему по CDP; нет браузера — запускает его.
 * Перезапуск vite браузер не гасит: кэш кода и HTTP остаются тёплыми, вкладки
 * экранов подхватывает следующий сервис (см. stream-tabs). Гасит браузер
 * отдельная команда `bun run browser:stop`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { resolveSnapshotBrowserPath } from '../gateway/snapshot-browser';

type Env = Readonly<Record<string, string | undefined>>;

/** CDP-порт постоянного браузера по умолчанию; `LAM_STREAM_CDP_PORT` меняет его (e2e — свой). */
export const DEFAULT_STREAM_CDP_PORT = 9341;
/** Сколько ждать CDP только что запущенного браузера, мс. */
const START_TIMEOUT_MS = 20_000;
const POLL_MS = 100;

/** Флаги трансляции: фоновые вкладки headless рисуются и не засыпают. */
const STREAM_ARGS = ['--ignore-certificate-errors', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];

/**
 * CDP-порт браузера трансляции.
 *
 * @param env - окружение процесса
 */
export function streamCdpPort(env: Env): number {
  const port = Number(env['LAM_STREAM_CDP_PORT']);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_STREAM_CDP_PORT;
}

/**
 * Папка профиля браузера: своя на каждый порт — два Helium с одним профилем
 * не живут (второй отдаёт вызов первому и выходит).
 *
 * @param env - окружение процесса (`LOCALAPPDATA`)
 * @param port - CDP-порт
 */
export function streamProfileDir(env: Env, port: number): string {
  const local = env['LOCALAPPDATA'];
  const root = local === undefined || local === '' ? path.join(homedir(), '.cache') : local;
  return path.join(root, 'live-app-map', 'stream-browser', String(port));
}

/**
 * Список вкладок владельца (экземпляра визуализатора) — рядом с профилем браузера.
 *
 * @param env - окружение процесса
 * @param owner - владелец: `vite-<порт>`
 */
export function streamTabsFile(env: Env, owner: string): string {
  return path.join(streamProfileDir(env, streamCdpPort(env)), `lam-tabs-${owner}.json`);
}

/**
 * Флаги запуска постоянного браузера.
 *
 * @param port - CDP-порт
 * @param profileDir - папка профиля
 */
export function streamBrowserArgs(port: number, profileDir: string): string[] {
  return ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', ...STREAM_ARGS];
}

/** Адрес CDP браузера. */
const cdpUrl = (port: number): string => `http://127.0.0.1:${port}`;

/** Адрес WebSocket браузера; null — браузера на порту нет. */
async function browserWs(port: number): Promise<string | null> {
  try {
    const r = await fetch(`${cdpUrl(port)}/json/version`, { signal: AbortSignal.timeout(1000) });
    const v: unknown = r.ok ? await r.json() : null;
    const ws = typeof v === 'object' && v !== null ? Reflect.get(v, 'webSocketDebuggerUrl') : undefined;
    return typeof ws === 'string' ? ws : null;
  } catch {
    return null;
  }
}

/** Запуск в процессе — один на порт: два одновременных подключения не запускают два браузера. */
const starting = new Map<number, Promise<void>>();

/** Запустить браузер отдельным процессом и дождаться CDP. */
async function startDetached(env: Env, port: number): Promise<void> {
  const dir = streamProfileDir(env, port);
  mkdirSync(dir, { recursive: true });
  const exe = resolveSnapshotBrowserPath(env, existsSync) ?? chromium.executablePath();
  const child = spawn(exe, streamBrowserArgs(port, dir), { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
  const end = Date.now() + START_TIMEOUT_MS;
  while ((await browserWs(port)) === null) {
    if (Date.now() > end) {
      throw new Error(`браузер трансляции не открыл CDP на :${port} за ${START_TIMEOUT_MS / 1000} с (${exe})`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Подключение к постоянному браузеру трансляции; нет его — запуск отдельным
 * процессом. close() у подключения только отключается: браузер живёт.
 *
 * @param env - окружение процесса
 */
export async function launchStreamBrowser(env: Env = process.env): Promise<Browser> {
  const port = streamCdpPort(env);
  if ((await browserWs(port)) === null) {
    const run = starting.get(port) ?? startDetached(env, port).finally(() => starting.delete(port));
    starting.set(port, run);
    await run;
  }
  return chromium.connectOverCDP(cdpUrl(port));
}

/**
 * Погасить постоянный браузер (Browser.close по CDP).
 *
 * @param port - CDP-порт
 * @returns false — браузера на порту не было
 */
export async function stopStreamBrowser(port: number): Promise<boolean> {
  const ws = await browserWs(port);
  if (ws === null) {
    return false;
  }
  await new Promise<void>((resolve, reject) => {
    const sock = new WebSocket(ws);
    sock.onopen = () => sock.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    sock.onclose = () => resolve();
    sock.onerror = () => reject(new Error(`нет связи с браузером трансляции на :${port}`));
  });
  const end = Date.now() + 5000;
  while ((await browserWs(port)) !== null && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return true;
}
