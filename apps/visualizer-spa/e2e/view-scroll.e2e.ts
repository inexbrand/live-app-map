/**
 * Прокрутка колесом во всех видах карты korbor-all: в окне 1600×1000 и 1440×800
 * каждая панель помещается в окно, а если содержимое выше панели — листается колесом мыши.
 */
import { expect, test, type Page } from '@playwright/test';
import { openMap, PROJECT_MAP } from './helpers';

/** Окна, в которых владелец видел, что вид «API» не листается. */
const VIEWPORTS = [
  { width: 1600, height: 1000 },
  { width: 1440, height: 800 },
];

/**
 * Панель не выходит за окно, а если её содержимое выше панели — колесо над `over` её сдвигает.
 *
 * @param page - страница
 * @param selector - CSS-селектор панели с прокруткой
 * @param over - CSS-селектор элемента внутри панели, над которым держать мышь; по умолчанию сама панель
 */
async function expectWheelScrolls(page: Page, selector: string, over = selector): Promise<void> {
  const pane = page.locator(selector).first();
  await expect(pane).toBeVisible();
  const size = await pane.evaluate((el) => ({
    bottom: el.getBoundingClientRect().bottom,
    overflow: el.scrollHeight - el.clientHeight,
  }));
  expect(size.bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  if (size.overflow <= 0) {
    return;
  }
  const box = await page.locator(over).first().boundingBox();
  if (box === null) {
    throw new Error(`нет размеров у ${over}`);
  }
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + box.height / 2, size.bottom - 8));
  const before = await pane.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
}

for (const viewport of VIEWPORTS) {
  test.describe(`прокрутка видов в окне ${viewport.width}×${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await openMap(page, PROJECT_MAP);
      await page.setViewportSize(viewport);
    });

    test('API: список роутов, покрытие в дереве и описание роута листаются колесом', async ({ page }) => {
      await page.getByTestId('view-api').click();
      await expect(page.getByTestId('api-route-row')).toHaveCount(314);
      await expectWheelScrolls(page, '.api-list__scroll');
      await expectWheelScrolls(page, '.api-tree', '[data-testid=api-coverage-box]');

      await page.locator('#api-search').fill('/api/v1/recruiter/vacancies/:vacancyId/applications');
      await page.getByTestId('api-route-row').filter({ hasText: 'POST' }).first().click();
      await expect(page.getByTestId('api-route-card')).toBeVisible();
      await expectWheelScrolls(page, '[data-testid=api-route-card]');
    });

    test('База данных, Документация и Сравнение листаются колесом', async ({ page }) => {
      await page.getByRole('button', { name: 'База данных' }).click();
      await expectWheelScrolls(page, '.db-view__list');
      await page.getByTestId('view-docs').click();
      await expectWheelScrolls(page, '.docs-list');
      await page.getByTestId('view-compare').click();
      await expectWheelScrolls(page, '.cmp-view');
    });
  });
}
