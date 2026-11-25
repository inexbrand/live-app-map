/**
 * Правки аудита интерфейса (эпоха ui-audit-fixes) в настоящем браузере:
 * фокус экрана, карточка в покое, подписи рёбер, обзор при отдалении, шапка на 768 px.
 * Скриншоты — в LAM_SHOTS_DIR, если задана.
 */
import { expect, test, type Page } from '@playwright/test';
import { pinKorborDocs } from './docs-fixture';
import { collectPageErrors, openAndSelectNode, shot, PROJECT_MAP } from './helpers';

/** Шапка не шире окна: ничего не вылезает и не обрезается прокруткой. */
async function headerFits(page: Page): Promise<{ readonly scroll: number; readonly client: number }> {
  return page.getByTestId('toolbar').evaluate((h) => ({ scroll: h.scrollWidth, client: h.clientWidth }));
}

test.describe('экраны', () => {
  test('фокус экрана: остальные гаснут, плашка под экраном, правой панели нет; Esc снимает фокус; на других видах плашки нет', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAndSelectNode(page);
    const bar = page.getByTestId('focus-bar');
    await expect(page.locator('.flow-host--focus')).toHaveCount(1);
    expect(await page.locator('.page-node--dim').count()).toBeGreaterThan(0);
    await expect(page.locator('.drawer')).toHaveCount(0);
    await shot(page, 'after-focus.png');

    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
    await expect(page.locator('.page-node--selected')).toHaveCount(0);
    await expect(page.locator('.page-node--dim')).toHaveCount(0);

    await page.locator('.page-node').first().click();
    await expect(bar).toBeVisible();
    await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: 'Сравнение' }).click();
    await expect(bar).toHaveCount(0);
    await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: 'Экраны' }).click();
    await expect(bar).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('карточка в покое — название и путь; кнопки под мышью; подписи рёбер — у выбранного', async ({ page }) => {
    await openAndSelectNode(page);
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
    await openAndSelectNode(page);
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

test.describe('API', () => {
  test('покрытие свёрнуто, значков у обычных роутов нет, описание из кода без курсива', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/?map=${PROJECT_MAP}&view=api`);
    await expect(page.getByTestId('api-view')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    const coverage = page.getByTestId('api-coverage-box').getByRole('button', { name: /^Покрытие: описано/ });
    await expect(coverage).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('api-coverage')).toBeHidden();
    const rows = page.getByTestId('api-route-row');
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);
    const marked = await page.locator('[data-testid=api-route-row]:has([data-testid=api-mark] svg)').count();
    expect(marked).toBeLessThan(total / 2);
    // Заголовок группы — имя домена и число, без пути группы (он и так в каждой строке).
    for (const heading of await page.getByTestId('api-domain-group').locator('h3').allInnerTexts()) {
      expect(heading).not.toContain('/');
    }
    const auto = page.locator('[data-testid=api-row-doc][data-auto=true]').first();
    await expect(auto).toBeVisible();
    expect(await auto.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');
    await shot(page, 'after-api.png');
    await coverage.click();
    await expect(page.getByTestId('api-coverage')).toBeVisible();
  });
});

test.describe('документация', () => {
  test('без повторов: «готово» не у каждой эпохи, чипа с нулём нет, файл без имени и второго заголовка, вкладки в один ряд', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/?map=${PROJECT_MAP}&view=docs`);
    await expect(page.getByTestId('docs-view')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    const rows = page.getByTestId('docs-epoch-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('.docs-row__state', { hasText: /^готово$/ })).toHaveCount(0);
    const chips = page.getByRole('group', { name: 'Готовность эпох' }).getByRole('button');
    await expect(chips.filter({ hasText: /Не готово 0/ })).toHaveCount(0);
    await rows.first().click();
    await expect(page.locator('.docs-doc__file')).toHaveCount(0);
    await expect(page.locator('.docs-doc__body h1')).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Файлы эпохи' });
    const tabTops = await tabs.getByRole('button').evaluateAll((bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
    expect(tabTops).toBe(1);
    await shot(page, 'after-docs.png');
  });
});

test.describe('граф документации', () => {
  test('по умолчанию без файлов кода — около 40 узлов, файлы — по фильтру', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/?map=${PROJECT_MAP}&view=docs`);
    await expect(page.getByTestId('docs-view')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('docs-mode-graph').click();
    const nodes = async (): Promise<number> => Number(((await page.getByTestId('graph-stats').textContent()) ?? '').match(/^(\d+) узлов/)?.[1] ?? NaN);
    await expect.poll(nodes).toBeGreaterThan(0);
    expect(await nodes()).toBeLessThanOrEqual(80);
    await shot(page, 'after-docs-graph.png');
    await page.getByRole('button', { name: 'показать все' }).click();
    await expect.poll(nodes).toBeGreaterThan(200);
  });
});

test.describe('числа документации', () => {
  test('снимок карты заменяется диском: пока читаю — строка-пояснение, после — числа с диска', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => { release = done; });
    // «Диск» отвечает по сигналу теста и на одну эпоху меньше снимка — видно, что числа сменились.
    const docs = await pinKorborDocs(page, async (route, d) => {
      await gate;
      await route.fulfill({ json: { docs: { ...d, epochs: d.epochs.slice(1) } } });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/?map=${PROJECT_MAP}&view=docs`);
    const source = page.getByTestId('docs-source');
    await expect(source).toContainText('Читаю документацию с диска…', { timeout: 30_000 });
    const snapshot = docs().epochs.length;
    await expect(source).toHaveText(`Показан снимок из карты (эпох: ${snapshot}). Читаю документацию с диска…`);
    await expect(page.getByTestId('docs-epoch-row')).toHaveCount(snapshot);
    await shot(page, 'after-docs-snapshot-note.png');
    release();
    await expect(source).toHaveCount(0);
    await expect(page.getByTestId('docs-epoch-row')).toHaveCount(snapshot - 1);
  });
});

test.describe('шапка', () => {
  test('на 768 px шапка не шире окна, «Источников» нет, крошка-дубль вкладки скрыта', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto(`/?map=${PROJECT_MAP}`);
    await expect(page.locator('[role=group][aria-label="Вид"]')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Источники' })).toHaveCount(0);
    await expect(page.getByTestId('breadcrumbs')).toHaveCount(0);
    for (const view of ['Экраны', 'Компоненты', 'API', 'База данных', 'Документация', 'Сравнение']) {
      await page.locator('[role=group][aria-label="Вид"]').getByRole('button', { name: view }).click();
      const { scroll, client } = await headerFits(page);
      expect(scroll, `шапка вида «${view}»`).toBeLessThanOrEqual(client);
    }
    await shot(page, 'after-header-768.png');
  });
});
