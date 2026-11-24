/**
 * Smoke e2e: chrome без «Карта приложения»/«Живой», селект карт, load → nodes.
 * Экран показывает вьюпорт раскладки карты (390×844).
 *
 * Холст рисует только видимые ноды (onlyRenderVisibleElements), поэтому число
 * экранов карты считаем по мини-карте — она рисует все.
 */
import { expect, test } from '@playwright/test';
import { minimapPages } from './minimap-pages';

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

    // Ждём каталог (реальные id карт, не только placeholder)
    await expect
      .poll(async () => {
        const values = await mapSelect.locator('option').evaluateAll((opts) =>
          opts.map((o) => (o as HTMLOptionElement).value),
        );
        return values.filter((v) => v.length > 0 && !v.startsWith('__')).length;
      })
      .toBeGreaterThan(0);

    const optionValues = await mapSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    const mini =
      optionValues.find((v) => v.includes('miniapp')) ??
      optionValues.find((v) => v.length > 0 && !v.startsWith('__'));
    expect(mini, `catalog options: ${optionValues.join(',')}`).toBeTruthy();
    await mapSelect.selectOption(mini!);

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

  test('load site map has many pages (>10)', async ({ page }) => {
    await page.goto('/');
    const mapSelect = page.getByTestId('map-select');
    await expect
      .poll(async () => {
        const values = await mapSelect.locator('option').evaluateAll((opts) =>
          opts.map((o) => (o as HTMLOptionElement).value),
        );
        return values.some((v) => v.includes('site')) ? 1 : 0;
      })
      .toBe(1);

    const optionValues = await mapSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    const site = optionValues.find((v) => v.includes('site'));
    expect(site).toBeTruthy();
    // Каталог пишет число экранов в подписи: «Сайт · 33 экр.»
    const label = await mapSelect.locator(`option[value="${site!}"]`).textContent();
    const catalogPages = Number(/(\d+)\s*экр/.exec(label ?? '')?.[1]);
    expect(catalogPages, `подпись: ${label}`).toBeGreaterThan(10);
    await mapSelect.selectOption(site!);
    await expect
      .poll(async () => minimapPages(page), { timeout: 45_000 })
      .toBe(catalogPages);
    await expect(page.locator('.react-flow__node-page').first()).toBeVisible();
  });
});
