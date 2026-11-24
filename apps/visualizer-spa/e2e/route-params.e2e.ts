/**
 * Экран с параметром маршрута открывается с реальным id из API korbor под
 * профилем экрана, а не с примером «demo» из скана (живой korbor: API :16000,
 * мини-апп https://vite.localhost:5175, профиль recruiter в .lam-sessions).
 */
import { expect, test } from '@playwright/test';
import { WIDE_VIEWPORT, PROJECT_MAP } from './helpers';
import { screenPage } from './stream-page';

test('vacancies/:id — реальная вакансия вместо «Не найдено»', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto(`/?map=${PROJECT_MAP}`);
  await expect(page.locator('.page-node__title').first()).toBeVisible({ timeout: 30_000 });
  // Экран находится поиском, как пользователем: холст сам приводит к нему, от раскладки тест не зависит.
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('vacancies / id');
  await page.locator('[data-testid=palette-row][data-kind=screen]', { hasText: /^vacancies \/ id/ }).first().click();
  const node = page.locator('[data-lam-node="route:/vacancies/[id]"]');
  await expect(node).toHaveClass(/page-node--selected/);
  const canvas = node.locator('canvas[data-lam-screen]');
  await expect.poll(async () => (await canvas.getAttribute('data-lam-url')) ?? '', { timeout: 30_000 }).toMatch(/#\/vacancies\/[0-9a-f-]{36}$/);
  const screen = await screenPage(node);
  // Экран показал вакансию: есть заголовок h1 и нет экрана ошибки.
  await expect.poll(() => screen.evaluate(() => document.querySelector('h1')?.textContent?.trim() ?? ''), { timeout: 30_000 }).not.toBe('');
  expect(await screen.evaluate(() => document.body.innerText)).not.toContain('Не найдено');
});
