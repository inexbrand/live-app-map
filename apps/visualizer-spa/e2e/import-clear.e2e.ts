/**
 * Import/clear e2e: пусто → импорт файла карты → очистка → снова пусто.
 * Импорт через скрытый input «Открыть JSON / .appmap», очистка — пункт
 * «Очистить карту» в селекте карт.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { minimapPages } from './minimap-pages';

const dir = path.dirname(fileURLToPath(import.meta.url));
const miniappMap = path.resolve(dir, '../../../test-fixtures/maps/korbor-miniapp.liveappmap.json');
/** Экраны файла: сервисы и внешние ссылки на холсте не экраны. */
const miniappPages = (JSON.parse(readFileSync(miniappMap, 'utf8')) as { pages: Array<{ type?: string }> }).pages.filter(
  (p) => p.type !== 'service' && p.type !== 'external',
).length;

test.describe('import and clear', () => {
  test('empty → import public map → clear → empty-state', async ({ page }) => {
    await page.goto('/');

    const emptyHeading = page.getByRole('heading', { name: 'Выберите карту' });
    await expect(emptyHeading).toBeVisible();

    await page.locator('#lam-file-input').setInputFiles(miniappMap);

    // Холст рисует только видимые ноды — все экраны файла видны на мини-карте.
    expect(miniappPages).toBeGreaterThan(10);
    await expect.poll(async () => minimapPages(page), { timeout: 30_000 }).toBe(miniappPages);
    await expect(page.locator('.react-flow__node-page').first()).toBeVisible();
    await expect(page.locator('.empty-state')).toHaveCount(0);
    await expect(page.locator('.react-flow')).toBeVisible();

    await page.getByTestId('map-select').selectOption('__clear__');

    await expect(emptyHeading).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });
});
