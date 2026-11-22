/**
 * Общие шаги e2e: открыть карту, выбрать экран, снять скриншот, собрать ошибки страницы, вызвать MCP.
 */
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Папка скриншотов для отчёта эпохи; без неё скриншоты не снимаются. */
const SHOTS = process.env['LAM_SHOTS_DIR'];

/** Окно, в котором снимаются скриншоты и меряются виды. */
export const WIDE_VIEWPORT = { width: 1600, height: 1000 };

/**
 * Скриншот страницы в LAM_SHOTS_DIR, если она задана.
 *
 * @param page - страница
 * @param name - имя файла
 */
export async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, name) });
  }
}

/**
 * Копит сообщения необработанных ошибок страницы.
 *
 * @param page - страница
 * @returns живой список ошибок
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * Открывает карту каталога в широком окне: ждёт переключатель видов и закрывает всплывающее Esc.
 *
 * @param page - страница
 * @param map - файл карты в public/maps, например korbor-all.liveappmap.json
 * @param options - добавка к адресу (`&view=api`) и своё ожидание готовности вместо переключателя видов
 */
export async function openMap(
  page: Page,
  map: string,
  options: { readonly query?: string; readonly ready?: (page: Page) => Promise<void> } = {},
): Promise<void> {
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto(`/?map=/maps/${map}${options.query ?? ''}`);
  if (options.ready === undefined) {
    await expect(page.locator('[role=group][aria-label="Вид"]')).toBeVisible({ timeout: 30_000 });
  } else {
    await options.ready(page);
  }
  await page.keyboard.press('Escape');
}

/** Открывает карту korbor-miniapp и выбирает первую целиком видимую ноду. */
export async function openMiniappAndSelectNode(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('map-select').selectOption('korbor-miniapp');
  await expect.poll(async () => page.locator('.react-flow__node').count()).toBeGreaterThan(5);
  const box = await page.locator('.react-flow__node').evaluateAll((els) => {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.x >= 0 && r.y >= 70 && r.right < window.innerWidth && r.y + 20 < window.innerHeight) {
        return { x: r.x + Math.min(20, r.width / 2), y: r.y + 12, id: el.getAttribute('data-id') ?? '' };
      }
    }
    return null;
  });
  expect(box).not.toBeNull();
  await page.mouse.click(box?.x ?? 0, box?.y ?? 0);
  await expect(page.locator('.page-node--selected [data-testid=node-comment]')).toBeVisible();
  return box?.id ?? '';
}

/** Замечание к области выбранного экрана: кнопка в шапке ноды → «Область» в подсказке. */
export async function startRegion(page: Page): Promise<void> {
  await page.locator('.page-node--selected [data-testid=node-comment]').click();
  await page.getByTestId('pick-hint').getByRole('button', { name: 'Область' }).click();
}

/** Выделяет мышью область 400×300 в слое снимка. */
export async function dragRegion(page: Page): Promise<void> {
  await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
  await page.mouse.move(420, 140);
  await page.mouse.down();
  await page.mouse.move(820, 440, { steps: 6 });
  await page.mouse.up();
}

/** Вызов инструмента MCP-сервера визуализатора; ответ — JSON из текста. */
export async function mcpCall(page: Page, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await page.request.post('/mcp', {
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Record<string, unknown>;
}
