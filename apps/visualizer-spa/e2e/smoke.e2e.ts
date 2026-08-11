/**
 * Smoke e2e: chrome без «Карта приложения»/«Живой», селект карт, load → nodes.
 * Full HD viewport 1920×1080 на нодах.
 */
import { expect, test } from '@playwright/test';

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

    // Первая нода: chrome показывает map layout default (390×844 fixed)
    const firstNode = page.locator('.react-flow__node').first();
    await firstNode.click();
    await expect(firstNode).toContainText(/390\s*[×x]\s*844/);

    // iframe attribute width/height = logical viewport из JSON layout
    const iframe = firstNode.locator('iframe').first();
    // iframe может быть frozen (budget) — pin or wait live
    if ((await iframe.count()) > 0) {
      await expect(iframe).toHaveAttribute('width', '390');
      await expect(iframe).toHaveAttribute('height', '844');
    } else {
      // budget: нет iframe → нода всё равно показывает 390×844 в chrome
      await expect(firstNode).toContainText('390');
    }

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
    await mapSelect.selectOption(site!);
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 45_000,
      })
      .toBeGreaterThan(10);
  });
});
