/**
 * Playwright e2e для visualizer SPA.
 *
 * Dev-сервер поднимается через webServer (порт 4310).
 * Если сервер недоступен и webServer не стартовал — suite падает с явной ошибкой
 * (не silent skip). reuseExistingServer: true локально, чтобы не дублировать
 * уже запущенный `bun run dev`.
 *
 * Пропуск только при явном env: PLAYWRIGHT_SKIP_WEBSERVER=1 + готовый baseURL
 * (сервер уже поднят вручную). Без сервера и без webServer — fail, не skip.
 */
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSnapshotBrowserPath } from './src/lib/gateway/snapshot-browser';

/** Браузер e2e: LAM_BROWSER_PATH или Helium; браузеры Playwright на машине не ставятся. */
const executablePath = resolveSnapshotBrowserPath(process.env, existsSync);

/** Речь для voice.e2e: микрофон Chromium читает этот файл по кругу (macOS say, 16 кГц, по 2 с тишины по краям). */
const VOICE_WAV = fileURLToPath(new URL('./e2e/fixtures/voice-ru.wav', import.meta.url));


/** Проект, чью карту открывают e2e: LAM_PROJECT или соседний ../korbor. */
const LAM_PROJECT = process.env['LAM_PROJECT'] ?? fileURLToPath(new URL('../../../korbor', import.meta.url));
process.env['LAM_PROJECT'] = LAM_PROJECT;

const PORT = 4310;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/voice.e2e.ts',
      use: {
        ...devices['Desktop Chrome'],
        // snapshot.e2e: диалог выбора вкладки getDisplayMedia принимается сам
        launchOptions: {
          executablePath,
          args: ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream'],
        },
      },
    },
    {
      name: 'voice',
      testMatch: '**/voice.e2e.ts',
      timeout: 360_000,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          executablePath,
          args: [
            '--auto-accept-this-tab-capture',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${VOICE_WAV}`,
            // Звук тест не выводит. С системным выходом AudioContext идёт по часам устройства:
            // у виртуального (NDI Audio) часы стоят — запись тишина, текст пустой.
            '--disable-audio-output',
          ],
        },
      },
    },
  ],
  /* webServer поднимает Vite; если порт уже занят локальным dev — reuse */
  webServer: skipWebServer
    ? undefined
    : {
        command: 'bun run dev',
        // e2e читают DOM страниц экранов через CDP браузера трансляции (e2e/stream-page.ts)
        env: { LAM_STREAM_CDP_PORT: process.env['LAM_STREAM_CDP_PORT'] ?? '9333', LAM_PROJECT },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});