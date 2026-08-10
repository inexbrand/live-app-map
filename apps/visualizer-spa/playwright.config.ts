/**
 * Playwright e2e для visualizer SPA.
 *
 * Dev-сервер поднимается через webServer (порт 4310).
 * Если сервер недоступен и webServer не стартовал — suite падает с явной ошибкой
 * (не silent skip). reuseExistingServer: true локально, чтобы не дублировать
 * уже запущенный `bun run dev`.
 *
 * Пропуск только при явном env: PLAYWRIGHT_SKIP_WEBSERVER=1 + готовый baseURL.
 */
import { defineConfig, devices } from '@playwright/test';

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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* webServer поднимает Vite; если порт уже занят локальным dev — reuse */
  webServer: skipWebServer
    ? undefined
    : {
        command: 'bun run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
