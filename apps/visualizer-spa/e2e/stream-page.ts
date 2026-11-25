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
 * Страница экрана ноды: холст смонтирован, вкладка трансляции помечена ключом экрана
 * (window.__lamScreenKey = data-lam-screen холста). По адресу не ищем: приложение уходит
 * редиректом (мини-апп / → #/feed), и адрес у разных экранов бывает одинаковым.
 *
 * @param node - нода карты
 */
export async function screenPage(node: Locator): Promise<Page> {
  const canvas = node.locator('canvas[data-lam-screen]');
  await expect(canvas).toBeAttached({ timeout: 30_000 });
  const key = (await canvas.getAttribute('data-lam-screen')) ?? '';
  const b = await streamBrowser();
  let found: Page | undefined;
  await expect(async () => {
    found = undefined;
    for (const p of b.contexts().flatMap((c) => c.pages())) {
      const k = await p.evaluate(() => (window as unknown as { __lamScreenKey?: string }).__lamScreenKey ?? null).catch(() => null);
      if (k === key) {
        found = p;
        break;
      }
    }
    expect(found, `вкладка экрана ${key} не открыта в браузере трансляции`).toBeDefined();
  }).toPass({ timeout: 30_000 });
  if (found === undefined) {
    throw new Error('страница экрана не найдена');
  }
  return found;
}
