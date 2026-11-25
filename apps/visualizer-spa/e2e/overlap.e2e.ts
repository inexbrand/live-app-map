/**
 * Панели не наезжают друг на друга и не уходят под холст: шапка, плашка
 * выбранного экрана, мини-карта, зум — на трёх размерах окна.
 * Открытый лист замечаний — поверх всего.
 */
import { expect, test, type Page } from '@playwright/test';
import { layoutItems, probeOf, type Probe } from './probes';
import { PROJECT_MAP } from './helpers';

/** Шапка — по data-testid: после перевода на shadcn у неё нет класса .toolbar. */
const TOOLBAR = '[data-testid=toolbar]';
const OVERLAYS = [TOOLBAR, '.focus-bar', '.react-flow__minimap', '.react-flow__controls'];

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
    await page.goto(`/?map=${PROJECT_MAP}`);
    await expect(page.locator('.page-node__title').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.page-node__title').first().click();
    await expect(page.getByTestId('focus-bar')).toBeVisible();

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
    const toolbarHeight = await page.locator(TOOLBAR).evaluate((t) => t.getBoundingClientRect().height);
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
    expect(p.shown).toEqual(expect.arrayContaining([`${TOOLBAR}[0]`, '.focus-bar[0]', '.react-flow__minimap[0]']));

    // Лист замечаний из шапки — сверху: его ничто не перекрывает, на шапку он не наезжает.
    await page.getByTestId('open-comments').click();
    await expect(page.getByTestId('comments-sheet')).toBeVisible();
    const sheet = await probe(page, [TOOLBAR, '.comments-sheet']);
    expect(sheet.shown).toEqual(expect.arrayContaining(['.comments-sheet[0]']));
    expect(sheet.covered).toEqual([]);
    expect(sheet.overlaps).toEqual([]);
  });
}