/**
 * Import/clear e2e: пусто → импорт файла карты → очистка → снова пусто.
 * Импорт через скрытый input «Открыть JSON / .appmap», очистка — пункт
 * «Очистить карту» в селекте карт.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const miniappMap = path.resolve(dir, '../public/maps/korbor-miniapp.liveappmap.json');

test.describe('import and clear', () => {
  test('empty → import public map → clear → empty-state', async ({ page }) => {
    await page.goto('/');

    const emptyHeading = page.getByRole('heading', { name: 'Выберите карту' });
    await expect(emptyHeading).toBeVisible();

    await page.locator('#lam-file-input').setInputFiles(miniappMap);

    await expect
      .poll(async () => page.locator('.react-flow__node').count(), { timeout: 30_000 })
      .toBeGreaterThan(10);
    await expect(page.locator('.empty-state')).toHaveCount(0);
    await expect(page.locator('.react-flow')).toBeVisible();

    await page.getByTestId('map-select').selectOption('__clear__');

    await expect(emptyHeading).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });
});
