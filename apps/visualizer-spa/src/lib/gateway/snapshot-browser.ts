/**
 * Какой браузер снимает экраны. Браузеры Playwright на машине не держим:
 * берём путь из LAM_BROWSER_PATH, иначе установленный Helium.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import type { SnapshotBrowser } from './snapshot-service';

/**
 * Путь к исполняемому файлу браузера для снимков.
 *
 * @param env - переменные окружения
 * @param exists - проверка, что файл есть
 * @returns путь или undefined — тогда Playwright берёт свой Chromium
 */
export function resolveSnapshotBrowserPath(env: Readonly<Record<string, string | undefined>>, exists: (p: string) => boolean): string | undefined {
  const explicit = env['LAM_BROWSER_PATH'];
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  const localAppData = env['LOCALAPPDATA'];
  if (localAppData === undefined || localAppData === '') {
    return undefined;
  }
  const helium = path.join(localAppData, 'imput', 'Helium', 'Application', 'chrome.exe');
  return exists(helium) ? helium : undefined;
}

/** Флаги трансляции: фоновые вкладки headless рисуются и не засыпают. */
const STREAM_ARGS = ['--ignore-certificate-errors', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];

/**
 * Флаги браузера трансляции. `LAM_STREAM_CDP_PORT` открывает CDP-порт: e2e
 * подключаются к нему и читают DOM страниц экранов (раньше — через iframe).
 *
 * @param env - окружение процесса
 */
export function streamBrowserArgs(env: Readonly<Record<string, string | undefined>>): string[] {
  const port = Number(env['LAM_STREAM_CDP_PORT']);
  return Number.isInteger(port) && port > 0 ? [...STREAM_ARGS, `--remote-debugging-port=${port}`] : [...STREAM_ARGS];
}

/** Запускает headless-браузер для трансляции экранов. */
export function launchStreamBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: resolveSnapshotBrowserPath(process.env, existsSync), args: streamBrowserArgs(process.env) });
}

/** Запускает headless-браузер для снимков. */
export function launchSnapshotBrowser(): Promise<SnapshotBrowser> {
  return chromium.launch({ executablePath: resolveSnapshotBrowserPath(process.env, existsSync) });
}
