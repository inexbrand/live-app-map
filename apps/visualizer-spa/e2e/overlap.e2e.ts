/**
 * Панели не наезжают друг на друга и не уходят под холст: шапка, панели
 * экрана, кнопка журнала, мини-карта, зум — на трёх размерах окна.
 * Открытая шторка (модальное окно с подложкой) — поверх всего.
 */
import { expect, test, type Page } from '@playwright/test';
import { layoutItems, probeOf, type Probe } from './probes';

const OVERLAYS = ['.toolbar', '.drawer', '.diag-fab', '.react-flow__minimap', '.react-flow__controls'];

async function probe(page: Page, selectors: readonly string[]): Promise<Probe> {
  return probeOf(await page.evaluate(layoutItems, selectors));
}

for (const { width, height } of [
  { width: 1600, height: 1000 },
  { width: 1280, height: 800 },
  { width: 1024, height: 700 },
]) {
  test(`нет наложений панелей ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?map=/maps/korbor-all.liveappmap.json');
    await expect(page.locator('.page-node__title').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.page-node__title').first().click();
    await expect(page.locator('.drawer').first()).toBeVisible();

    // Выбранная нода — не под панелями (холст сдвигается к ней).
    await expect
      .poll(async () => (await probe(page, [...OVERLAYS, '.react-flow__node.selected, .page-node--selected'])).overlaps.filter((o) => o.includes('selected')), { timeout: 5_000 })
      .toEqual([]);

    // Шапка выбранной ноды внутри ноды: полоса размеров не выдавливает её.
    const sel = page.locator('.page-node--selected');
    await sel.locator('[data-lam-full-height]').focus();
    const inside = await sel.evaluate((n) => {
      const h = n.querySelector('.page-node__header')?.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      return h !== undefined && h.top >= r.top - 1 && n.scrollTop === 0;
    });
    expect(inside).toBe(true);

    // Шапка в одну строку: высокая шапка опускает панели на мини-карту и зум.
    const toolbarHeight = await page.locator('.toolbar').evaluate((t) => t.getBoundingClientRect().height);
    expect(toolbarHeight).toBeLessThan(70);

    // Панель экрана растёт, пока грузится содержимое: наложений нет в устоявшемся виде,
    // а не в первый кадр после клика (иначе при нескольких воркерах тест плавает).
    await expect
      .poll(async () => {
        const p = await probe(page, OVERLAYS);
        return { overlaps: p.overlaps, covered: p.covered };
      }, { timeout: 5_000 })
      .toEqual({ overlaps: [], covered: [] });
    const p = await probe(page, OVERLAYS);
    expect(p.shown).toEqual(expect.arrayContaining(['.toolbar[0]', '.drawer[0]', '.diag-fab[0]', '.react-flow__minimap[0]']));

    // Шторка журнала — модальная: она сверху, подложка закрывает остальное.
    await page.locator('.diag-fab').click();
    const sheet = await probe(page, ['.edge-sheet']);
    expect(sheet.shown.length).toBe(1);
    expect(sheet.covered).toEqual([]);
  });
}