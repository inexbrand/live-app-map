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
import { fileURLToPath } from 'node:url';

/** Речь для voice.e2e: микрофон Chromium читает этот файл (macOS say, 16 кГц). */
const VOICE_WAV = fileURLToPath(new URL('./e2e/fixtures/voice-ru.wav', import.meta.url));

/**
 * Модели речи для e2e: своя папка (тест «первое использование» её очищает,
 * модель разработчика в .lam-models не трогается), а «скачивание» идёт из
 * зеркала — .lam-models разработчика; файла там нет — с Hugging Face.
 */
export const E2E_MODELS = {
  LAM_MODELS_DIR: fileURLToPath(new URL('../../.lam-models-e2e', import.meta.url)),
  LAM_MODELS_MIRROR: fileURLToPath(new URL('../../.lam-models', import.meta.url)),
};

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
          args: [
            '--auto-accept-this-tab-capture',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${VOICE_WAV}`,
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
        env: E2E_MODELS,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});