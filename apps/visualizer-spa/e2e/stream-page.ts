/**
 * Страница экрана в браузере трансляции: e2e подключаются к его CDP-порту
 * (LAM_STREAM_CDP_PORT у dev-сервера) и находят страницу по адресу холста.
 */
import { chromium, expect, type Browser, type Locator, type Page } from '@playwright/test';

/** Порт CDP браузера трансляции; dev-сервер e2e поднимается с тем же. */
export const STREAM_CDP_PORT = Number(process.env['LAM_STREAM_CDP_PORT'] ?? 9333);

let browser: Browser | null = null;

/** Браузер трансляции запускается при первом наборе экранов — подключение с повтором. */
async function streamBrowser(): Promise<Browser> {
  const end = Date.now() + 30_000;
  while (browser === null) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${STREAM_CDP_PORT}`);
    } catch (e) {
      if (Date.now() > end) {
        throw new Error(`нет CDP браузера трансляции на :${STREAM_CDP_PORT} — dev-сервер должен быть запущен с LAM_STREAM_CDP_PORT=${STREAM_CDP_PORT} (${String(e)})`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return browser;
}

/**
 * Страница экрана ноды: холст смонтирован, адрес — data-lam-url.
 *
 * @param node - нода карты
 */
export async function screenPage(node: Locator): Promise<Page> {
  const canvas = node.locator('canvas[data-lam-screen]');
  await expect(canvas).toBeAttached({ timeout: 30_000 });
  const url = (await canvas.getAttribute('data-lam-url')) ?? '';
  const b = await streamBrowser();
  let found: Page | undefined;
  await expect(async () => {
    found = b.contexts().flatMap((c) => c.pages()).find((p) => p.url() === url || p.url().startsWith(url.split('#')[0] ?? url));
    expect(found, `страница ${url} не открыта в браузере трансляции`).toBeDefined();
  }).toPass({ timeout: 30_000 });
  if (found === undefined) {
    throw new Error('страница экрана не найдена');
  }
  return found;
}
