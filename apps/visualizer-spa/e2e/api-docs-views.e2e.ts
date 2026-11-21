/**
 * Виды «API» и «Документация» на настоящих картах korbor-all и live-app-map:
 * фильтры, переходы роут → таблица → роут → экран, эпохи с готовностью,
 * ссылки из документа на роут, скриншоты эпохи через dev-эндпоинт.
 * Скриншоты пишутся в папку эпохи (LAM_SHOTS_DIR), если она задана.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const SHOTS = process.env['LAM_SHOTS_DIR'];

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, name) });
  }
}

async function openMap(page: Page, map: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/?map=/maps/${map}`);
  await expect(page.locator('[role=group][aria-label="Вид"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
}

test.describe('вид «API» на korbor', () => {
  test('дерево, фильтры, карточка, переходы к таблице, обратно к роуту и к экрану', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openMap(page, 'korbor-all.liveappmap.json');
    await page.getByTestId('view-api').click();
    const rows = page.getByTestId('api-route-row');
    await expect(rows).toHaveCount(314);
    await expect(page.getByTestId('api-coverage')).toContainText('из 314');

    // Раздел admin в дереве сужает список.
    await page.getByTestId('api-section').filter({ hasText: 'admin' }).first().click();
    const adminCount = await rows.count();
    expect(adminCount).toBeGreaterThan(50);
    expect(adminCount).toBeLessThan(314);
    await page.getByRole('button', { name: /^Все роуты/ }).click();

    // Метод + таблица.
    await page.getByTestId('api-method-PATCH').click();
    const patchCount = await rows.count();
    await page.locator('#api-table').fill('vacancies');
    await expect.poll(async () => rows.count()).toBeLessThan(patchCount);
    for (const text of await rows.allInnerTexts()) {
      expect(text.startsWith('PATCH')).toBe(true);
    }
    await rows.first().click();
    const card = page.getByTestId('api-route-card');
    await expect(card).toContainText('Таблицы');
    await shot(page, 'api-korbor-filter.png');

    // Роут → таблица в «Базе данных» → роут обратно.
    await card.getByTestId('api-table-link').filter({ hasText: /^vacancies/ }).first().click();
    await expect(page.getByTestId('db-table')).toBeVisible();
    await expect(page.getByTestId('db-table').locator('h2')).toHaveText('vacancies');
    // Возврат к роуту: фильтры вида «API» сохранились.
    await page.getByTestId('db-route-link').first().click();
    await expect(page.getByTestId('api-route-card')).toBeVisible();
    await expect(page.getByTestId('api-method-PATCH')).toHaveClass(/ui-chip--active/);
    await expect(page.locator('#api-table')).toHaveValue('vacancies');

    // Сброс, поиск роута с экраном, вход и доступ в карточке, переход к экрану.
    await page.getByRole('button', { name: /^Сбросить/ }).click();
    await page.locator('#api-search').fill('/api/v1/recruiter/vacancies/:vacancyId/applications');
    await rows.filter({ hasText: 'POST' }).first().click();
    await expect(card.getByTestId('api-input').first()).toBeVisible();
    await expect(card.getByTestId('api-access')).toContainText('Нужен вход');
    await shot(page, 'api-korbor-card.png');
    await card.getByTestId('api-screen-link').first().click();
    await expect(page.locator('.react-flow')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('«без описания» оставляет роуты без авторского описания, у каждого — описание из кода', async ({ page }) => {
    await openMap(page, 'korbor-all.liveappmap.json');
    await page.getByTestId('view-api').click();
    await page.getByTestId('api-undocumented').click();
    const rows = page.getByTestId('api-route-row');
    await expect.poll(async () => rows.count()).toBeGreaterThan(200);
    await expect(page.locator('.api-row__doc:not(.api-row__doc--auto)')).toHaveCount(0);
    await expect(page.locator('.api-row__doc--auto')).toHaveCount(await rows.count());
    await shot(page, 'api-korbor-undocumented.png');
  });

  test('карточка: описание из кода, экран админки; «без экранов» — с причиной', async ({ page }) => {
    await openMap(page, 'korbor-all.liveappmap.json');
    await page.getByTestId('view-api').click();
    const rows = page.getByTestId('api-route-row');
    await page.locator('#api-search').fill('/api/v1/admin/vacancies');
    await page.getByTestId('api-method-GET').click();
    await page.locator('[data-route-id="api:@korbor/api GET /api/v1/admin/vacancies"]').click();
    const card = page.getByTestId('api-route-card');
    await expect(card.getByTestId('api-auto-doc')).toContainText('описание собрано из кода');
    await expect(card.getByTestId('api-auto-doc')).toContainText('Чтение «vacancies»');
    await expect(card.getByTestId('api-screen-link').first()).toBeVisible();
    await shot(page, 'api-after-card.png');

    await page.getByRole('button', { name: /^Сбросить/ }).click();
    await page.getByTestId('api-no-screens').click();
    const left = await rows.count();
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(314);
    await rows.first().click();
    await expect(card.getByTestId('api-screen-gap')).toContainText('Экраны карты не вызывают');
    await shot(page, 'api-after-no-screens.png');
  });
});

test.describe('вид «Документация»', () => {
  test('korbor: эпохи с готовностью, открытые пункты, ссылка из текста на роут', async ({ page }) => {
    await openMap(page, 'korbor-all.liveappmap.json');
    await page.getByTestId('view-docs').click();
    await expect(page.getByTestId('docs-epoch-row')).toHaveCount(26);
    await page.getByRole('button', { name: /^Не готово/ }).click();
    const notReady = page.getByTestId('docs-epoch-row');
    await expect.poll(async () => notReady.count()).toBeGreaterThan(0);
    await notReady.filter({ hasText: 'perf-load-test' }).click();
    await expect(page.getByTestId('docs-open-bugs')).toContainText('rate limiter');
    await page.getByRole('button', { name: 'Баги', exact: true }).click();
    await expect(page.getByTestId('doc-markdown')).toContainText('Баги');
    await shot(page, 'docs-korbor-not-ready.png');

    await page.getByRole('button', { name: /^Все$/ }).click();
    await page.locator('#docs-search').fill('telegram-login');
    await page.getByTestId('docs-hit').first().click();
    const ref = page.getByTestId('doc-ref').filter({ hasText: 'POST /api/v1/auth/web/telegram-login' }).first();
    await expect(ref).toBeVisible();
    await ref.click();
    await expect(page.getByTestId('api-route-card')).toContainText('/api/v1/auth/web/telegram-login');
  });

  test('live-app-map: свои эпохи видны, скриншоты эпохи грузятся', async ({ page }) => {
    await openMap(page, 'live-app-map.liveappmap.json');
    await page.getByTestId('view-docs').click();
    await expect(page.getByTestId('docs-epoch-row').filter({ hasText: 'api-docs-views' })).toBeVisible();
    await page.getByTestId('docs-epoch-row').filter({ hasText: 'live-korbor-e2e' }).click();
    await page.getByRole('button', { name: 'Проверка', exact: true }).click();
    await expect(page.getByTestId('doc-markdown')).toContainText('Живая проверка');
    const gallery = page.getByTestId('docs-gallery');
    await expect(gallery).toBeVisible();
    const first = gallery.locator('img').first();
    await first.scrollIntoViewIfNeeded();
    await expect.poll(async () => first.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await shot(page, 'docs-lam-epoch.png');
    await gallery.locator('img').first().click();
    await expect(page.locator('.docs-zoom img')).toBeVisible();
    await shot(page, 'docs-lam-zoom.png');
  });
});
