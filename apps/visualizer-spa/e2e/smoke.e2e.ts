/**
 * Smoke e2e: chrome без «Карта приложения»/«Живой», селект карт, load → nodes.
 * Экран показывает вьюпорт раскладки карты (390×844).
 *
 * Холст рисует только видимые ноды (onlyRenderVisibleElements), поэтому число
 * экранов карты считаем по мини-карте — она рисует все.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pickOption, PROJECT_MAP_ID } from './helpers';
import { minimapPages } from './minimap-pages';

/**
 * Подписи карт каталога в списке выбора карты (shadcn Select): открыть, прочитать, закрыть Esc.
 *
 * @param page - вкладка визуализатора
 * @param trigger - кнопка списка
 */
async function catalogLabels(page: Page, trigger: Locator): Promise<string[]> {
  await trigger.click();
  const texts = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  return texts.map((t) => t.trim()).filter((t) => /экр\./.test(t));
}

/** Пункт карты проекта в каталоге: подпись начинается с имени проекта из config.ts. */
const PROJECT_OPTION = new RegExp(`^${PROJECT_MAP_ID} · `);

test.describe('visualizer smoke', () => {
  test('toolbar: no brand/live, map select works, FHD viewport', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // Не должно быть старого chrome
    await expect(page.getByText('Карта приложения', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Живой', { exact: true })).toHaveCount(0);

    // Селект карт в шапке
    const mapSelect = page.getByTestId('map-select');
    await expect(mapSelect).toBeVisible();

    // Empty state
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Выберите карту' }),
    ).toBeVisible();

    // Ждём каталог: в списке есть карты с числом экранов
    await expect.poll(async () => (await catalogLabels(page, mapSelect)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await pickOption(page, mapSelect, PROJECT_OPTION);

    // Холст React Flow + ноды
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    await expect(page.locator('.empty-state')).toHaveCount(0);

    // Первый экран (не рамка группы): chrome показывает map layout default (390×844 fixed)
    const firstNode = page.locator('.react-flow__node-page').first();
    await firstNode.click();
    await expect(firstNode).toContainText(/390\s*[×x]\s*844/);

    // Холст экрана в пикселях окна страницы из layout карты (390×844); без живого слота — снимок или подсказка
    const screen = firstNode.locator('canvas[data-lam-screen]').first();
    if ((await screen.count()) > 0) {
      await expect(screen).toHaveAttribute('width', '390');
      await expect(screen).toHaveAttribute('height', '844');
    } else {
      await expect(firstNode).toContainText('390');
    }
    await expect(page.locator('iframe')).toHaveCount(0);

    // Нет fatal pageerror (null-byte babel и т.п.)
    const fatal = consoleErrors.filter(
      (m) =>
        m.includes('\\x00') ||
        m.includes('Unexpected') ||
        m.includes('is not defined'),
    );
    expect(fatal, fatal.join('\n')).toEqual([]);
  });

  test('карта проекта: экранов в подписи каталога больше 10, все на мини-карте', async ({ page }) => {
    await page.goto('/');
    const mapSelect = page.getByTestId('map-select');
    let label: string | undefined;
    await expect
      .poll(async () => {
        label = (await catalogLabels(page, mapSelect)).find((t) => PROJECT_OPTION.test(t));
        return label ?? '';
      }, { timeout: 15_000 })
      .not.toBe('');
    // Каталог пишет число экранов в подписи: «korbor · 91 экр.»
    const catalogPages = Number(/(\d+)\s*экр/.exec(label ?? '')?.[1]);
    expect(catalogPages, `подпись: ${label}`).toBeGreaterThan(10);
    await pickOption(page, mapSelect, PROJECT_OPTION);
    await expect
      .poll(async () => minimapPages(page), { timeout: 45_000 })
      .toBe(catalogPages);
    await expect(page.locator('.react-flow__node-page').first()).toBeVisible();
  });
});
