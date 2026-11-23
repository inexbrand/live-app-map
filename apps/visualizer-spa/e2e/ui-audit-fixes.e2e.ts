/**
 * Правки аудита интерфейса (эпоха ui-audit-fixes) в настоящем браузере:
 * панель экрана, карточка в покое, подписи рёбер, обзор при отдалении, шапка на 768 px.
 * Скриншоты — в LAM_SHOTS_DIR, если задана.
 */
import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, openMiniappAndSelectNode, shot } from './helpers';

/** Шапка не шире окна: ничего не вылезает и не обрезается прокруткой. */
async function headerFits(page: Page): Promise<{ readonly scroll: number; readonly client: number }> {
  return page.locator('header.toolbar').evaluate((h) => ({ scroll: h.scrollWidth, client: h.clientWidth }));
}

test.describe('экраны', () => {
  test('панель экрана закрывается крестиком, Esc и не висит на других видах', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openMiniappAndSelectNode(page);
    const drawer = page.getByTestId('page-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Закрыть панель' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.locator('.page-node--selected')).toHaveCount(0);

    await page.locator('.page-node').first().click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await page.locator('.page-node').first().click();
    await expect(drawer).toBeVisible();
    await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: 'Сравнение' }).click();
    await expect(drawer).toBeHidden();
    await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: 'Экраны' }).click();
    await expect(drawer).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('карточка в покое — название и путь; кнопки под мышью; подписи рёбер — у выбранного', async ({ page }) => {
    await openMiniappAndSelectNode(page);
    await page.keyboard.press('Escape');
    await page.mouse.move(4, 4);
    await expect(page.locator('.page-node--selected')).toHaveCount(0);
    await expect(page.locator('.page-node__actions')).toHaveCount(0);
    await expect(page.locator('.page-node__size')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge-text')).toHaveCount(0);
    await expect(page.locator('.page-node .ui-badge', { hasText: /^(live|warm)$/ })).toHaveCount(0);
    await shot(page, 'after-canvas-rest.png');

    const node = page.locator('.page-node').first();
    await node.hover();
    await expect(node.locator('.page-node__actions')).toBeVisible();
    await node.click();
    await expect(page.locator('.page-node--selected .page-node__size')).toContainText('×');
    await shot(page, 'after-canvas-selected.png');
  });

  test('обзор при отдалении: подписи разделов и экранов читаются', async ({ page }) => {
    await openMiniappAndSelectNode(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'fit view' }).click();
    const host = page.locator('.flow-host');
    await expect(host).toHaveClass(/flow-host--overview/);
    const title = page.locator('.group-frame__title').first();
    await expect.poll(async () => (await title.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(12);
    // Подпись над рамкой и не обрезана ею: верх подписи выше верха рамки
    const [t, f] = await Promise.all([title.boundingBox(), page.locator('.group-frame').first().boundingBox()]);
    expect((t?.y ?? 0) + (t?.height ?? 0)).toBeLessThanOrEqual((f?.y ?? 0) + 2);
    // Вне рамки подпись видна, только если нода рамки не обрезает отрисовку
    expect(await title.evaluate((el) => getComputedStyle(el.closest('.react-flow__node') ?? el).contain)).not.toContain('paint');
    await expect(page.locator('.page-node__path').first()).toBeHidden();
    await shot(page, 'after-canvas-overview.png');
  });
});

test.describe('ошибки загрузки', () => {
  test('карты нет по адресу: понятный баннер, без «Unexpected token» и без дубля во всплывающем', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?map=/maps/nope.liveappmap.json');
    const banner = page.locator('.error-banner');
    await expect(banner).toContainText('нет файла — сервер вернул веб-страницу');
    await expect(banner).not.toContainText('Unexpected token');
    await expect(page.locator('.toast', { hasText: 'nope.liveappmap.json' })).toHaveCount(0);
    await shot(page, 'after-load-error.png');
  });
});

test.describe('шапка', () => {
  test('на 768 px шапка не шире окна, «Источников» нет, крошка-дубль вкладки скрыта', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto('/?map=/maps/korbor-all.liveappmap.json');
    await expect(page.locator('[role=group][aria-label="Вид"]')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Источники' })).toHaveCount(0);
    await expect(page.getByTestId('breadcrumbs')).toHaveCount(0);
    for (const view of ['Экраны', 'API', 'База данных', 'Документация', 'Сравнение']) {
      await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: view }).click();
      const { scroll, client } = await headerFits(page);
      expect(scroll, `шапка вида «${view}»`).toBeLessThanOrEqual(client);
    }
    await shot(page, 'after-header-768.png');
  });
});
