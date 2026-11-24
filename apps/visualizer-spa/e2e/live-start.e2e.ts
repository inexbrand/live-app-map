/**
 * Свежая загрузка карты сразу даёт живые экраны: повторная загрузка той же
 * карты (адрес и каталог) не оставляет набор видимых нод пустым.
 */
import { expect, test } from '@playwright/test';
import { PROJECT_MAP } from './helpers';

for (const map of [PROJECT_MAP]) {
  test(`живые экраны со старта — ${map}, 4 свежие загрузки`, async ({ browser }) => {
    for (let i = 0; i < 4; i++) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(`/?map=${map}`);
      await expect(page.locator('.react-flow__node-page').first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.locator('[data-lam-live="1"]').count(), { timeout: 10_000 }).toBeGreaterThan(0);
      await page.close();
    }
  });
}
