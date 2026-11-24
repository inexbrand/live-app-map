/**
 * Общие шаги e2e: открыть карту, выбрать экран, снять скриншот, собрать ошибки страницы, вызвать MCP.
 */
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { firstNodeInView, mcpResult } from './probes';

/** Карта открытого проекта (dev-сервер с LAM_PROJECT, см. playwright.config). */
export const PROJECT_MAP = '/__lam_project/map.json';

/** id карты проекта в каталоге — имя проекта из config.ts. */
export const PROJECT_MAP_ID = process.env['LAM_E2E_PROJECT_ID'] ?? 'korbor';

/** Карта самого live-app-map в public/maps. */
export const SELF_MAP = '/maps/live-app-map.liveappmap.json';

/**
 * Файл карты проекта на диске: LAM_PROJECT → .live-app-map/map.json.
 *
 * @returns абсолютный путь
 * @throws Error — LAM_PROJECT не задан
 */
export function projectMapFile(): string {
  const project = process.env['LAM_PROJECT'];
  if (project === undefined || project === '') {
    throw new Error('LAM_PROJECT не задан: e2e открывают карту проекта (playwright.config задаёт ../korbor)');
  }
  return path.join(path.resolve(project), '.live-app-map', 'map.json');
}

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
 * @param map - адрес карты: {@link PROJECT_MAP} или {@link SELF_MAP}
 * @param options - добавка к адресу (`&view=api`) и своё ожидание готовности вместо переключателя видов
 */
export async function openMap(
  page: Page,
  map: string,
  options: { readonly query?: string; readonly ready?: (page: Page) => Promise<void> } = {},
): Promise<void> {
  const { query = '', ready = viewSwitchShown } = options;
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto(`/?map=${map}${query}`);
  await ready(page);
  await page.keyboard.press('Escape');
}

/** Карта открыта: виден переключатель вида. */
async function viewSwitchShown(page: Page): Promise<void> {
  await expect(page.locator('[role=group][aria-label="Вид"]')).toBeVisible({ timeout: 30_000 });
}

/**
 * Открывает карту и выбирает первый экран, видимый целиком: экран в фокусе, плашка под ним.
 * По умолчанию — карта проекта; первым целиком видимым обычно оказывается экран сайта.
 *
 * @param page - страница
 * @param map - адрес карты
 * @returns id выбранной ноды
 */
export async function openAndSelectNode(page: Page, map = PROJECT_MAP): Promise<string> {
  await openMap(page, map);
  const pages = page.locator('.react-flow__node:has(.page-node)');
  await expect.poll(async () => pages.count(), { timeout: 30_000 }).toBeGreaterThan(3);
  const box = await pages.evaluateAll(firstNodeInView);
  if (box === null) {
    throw new Error('на холсте нет экрана, видимого целиком под шапкой');
  }
  await page.mouse.click(box.x, box.y);
  await expect(page.getByTestId('focus-bar')).toBeVisible();
  return box.id;
}

/** Замечание к области выбранного экрана: ⌥⇧S. */
export async function startRegion(page: Page): Promise<void> {
  await page.keyboard.press('Alt+Shift+KeyS');
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
  return mcpResult(await res.json());
}
