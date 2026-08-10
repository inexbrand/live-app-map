/**
 * Import/clear e2e: empty → import map → clear → empty-state снова.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const miniappMap = path.resolve(
  dir,
  '../public/maps/korbor-miniapp.liveappmap.json',
);

test.describe('import and clear', () => {
  test('empty → import public map → clear → empty-state', async ({ page }) => {
    await page.goto('/');

    const emptyHeading = page.getByRole('heading', { name: 'Live App Map' });
    await expect(emptyHeading).toBeVisible();
    await expect(page.locator('.empty-state')).toBeVisible();

    // Import через скрытый file input («Открыть…»)
    await page
      .locator('header.toolbar input[type="file"]')
      .setInputFiles(miniappMap);

    const statusBar = page.locator('footer.status-bar');
    await expect
      .poll(async () => {
        const text = await statusBar.innerText();
        const match = text.match(/nodes:\s*(\d+)/);
        return match ? Number(match[1]) : 0;
      })
      .toBeGreaterThan(0);

    await expect(page.locator('.empty-state')).toHaveCount(0);
    await expect(page.locator('.react-flow')).toBeVisible();

    await page.getByRole('button', { name: 'Очистить' }).click();

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(emptyHeading).toBeVisible();
    await expect(statusBar).toContainText(/nodes:\s*0/);
  });
});
