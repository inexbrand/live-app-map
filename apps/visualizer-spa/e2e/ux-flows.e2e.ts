/**
 * Сценарии владельца на korbor-all: «понять проект» (поиск → роут → таблица → назад),
 * «закрыть задачу» (незакрытая эпоха → баги → связи → ссылка), граф документации,
 * горячие клавиши и тема. Скриншоты — в LAM_SHOTS_DIR, если задана.
 */
import { expect, test, type Page } from '@playwright/test';
import { OPEN_EPOCH, pinKorborDocs } from './docs-fixture';
import { collectPageErrors, openMap, shot, WIDE_VIEWPORT, PROJECT_MAP } from './helpers';

function openKorbor(page: Page, query = ''): Promise<void> {
  return openMap(page, PROJECT_MAP, { query });
}

/** Открыть результат глобального поиска нужного типа. */
async function palettePick(page: Page, query: string, kind: string): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.getByTestId('palette-input').fill(query);
  await page.locator(`[data-testid=palette-row][data-kind=${kind}]`).first().click();
  await expect(page.getByTestId('palette')).toBeHidden();
}

test.describe('понять проект', () => {
  test('поиск → роут → таблица → назад; адрес хранит место, крошки ведут обратно', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openKorbor(page);

    await palettePick(page, 'telegram-login', 'route');
    const card = page.getByTestId('api-route-card');
    await expect(card).toContainText('/api/v1/auth/web/telegram-login');
    await expect(page).toHaveURL(/view=api/);
    await expect(page).toHaveURL(/route=/);
    await expect(page.getByTestId('breadcrumbs')).toContainText('/api/v1/auth/web/telegram-login');
    await shot(page, 'flow-route.png');

    await palettePick(page, 'vacancies', 'table');
    await expect(page.getByTestId('db-table').locator('h2')).toHaveText('vacancies');
    await expect(page).toHaveURL(/view=database&table=vacancies/);

    // «Назад» браузера возвращает роут, F5 — то же место.
    await page.goBack();
    await expect(card).toContainText('/api/v1/auth/web/telegram-login');
    await page.reload();
    await expect(page.getByTestId('api-route-card')).toContainText('/api/v1/auth/web/telegram-login', { timeout: 30_000 });

    // Крошка вида снимает выбор.
    await page.getByTestId('breadcrumbs').getByRole('button', { name: 'API', exact: true }).click();
    await expect(page.getByTestId('api-route-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('экран из поиска: холст выбирает его, в адресе screen, крошки с группой', async ({ page }) => {
    await openKorbor(page);
    await palettePick(page, 'applications', 'screen');
    await expect(page).toHaveURL(/screen=/);
    const crumbs = page.getByTestId('breadcrumbs');
    await expect(crumbs).toContainText('applications');
    await expect(page.locator('.react-flow__node.selected, .page-node--selected').first()).toBeVisible();
    await shot(page, 'flow-screen.png');
  });

  test('клавиши: 2 — API, 3 — БД, 4 — документация, ? — справка, Esc закрывает', async ({ page }) => {
    await openKorbor(page);
    await page.keyboard.press('2');
    await expect(page.getByTestId('api-route-row').first()).toBeVisible();
    await page.keyboard.press('3');
    await expect(page.getByTestId('database-view')).toBeVisible();
    await page.keyboard.press('4');
    await expect(page.getByTestId('docs-view')).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-help')).toBeVisible();
    await shot(page, 'flow-help.png');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts-help')).toBeHidden();
  });
});

test.describe('закрыть задачу', () => {
  test('незакрытая эпоха → баги → связи документа → ссылка на документ открывается заново', async ({ page }) => {
    // Тестовая незакрытая эпоха — сценарий не зависит от того, что закрыто в korbor.
    await pinKorborDocs(page);
    await openKorbor(page, '&view=docs');
    await page.getByRole('button', { name: /^Не готово/ }).click();
    await page.getByTestId('docs-epoch-row').filter({ hasText: OPEN_EPOCH.slug }).click();
    await expect(page.getByTestId('docs-open-bugs')).toContainText(OPEN_EPOCH.bug);
    await page.getByRole('button', { name: 'Баги', exact: true }).click();
    const local = page.getByTestId('local-graph');
    await expect(local.getByTestId('local-graph-out')).toContainText(OPEN_EPOCH.route);
    await expect(local.getByTestId('local-graph-in')).toContainText(OPEN_EPOCH.slug);
    await expect(page.getByTestId('local-graph-canvas')).toHaveAttribute('data-nodes', /^[3-9]|\d{2,}$/);
    await shot(page, 'flow-close-task.png');

    // Адрес документа — ссылка: новая вкладка открывает тот же файл.
    const url = page.url();
    expect(url).toContain('09-bugs.md');
    const again = await page.context().newPage();
    await again.setViewportSize(WIDE_VIEWPORT);
    await again.goto(url);
    await expect(again.getByTestId('docs-doc')).toContainText(OPEN_EPOCH.bug, { timeout: 30_000 });
    await again.close();
  });
});

test.describe('граф документации', () => {
  test('сначала только документы, «показать все» — сотни узлов на canvas, фильтры, поиск, карточка узла, переход на карту', async ({ page }) => {
    // Фильтру «Не готово» нужна незакрытая эпоха — тестовая, не из korbor.
    await pinKorborDocs(page);
    await openKorbor(page, '&view=docs');
    await page.keyboard.press('g');
    const canvas = page.getByTestId('doc-graph-canvas');
    await expect(canvas).toBeVisible();
    await expect(page).toHaveURL(/docs=graph/);
    const nodes = async (): Promise<number> => Number(await canvas.getAttribute('data-nodes'));
    await expect.poll(nodes).toBeGreaterThan(0);
    expect(await nodes()).toBeLessThan(100);
    await page.getByRole('button', { name: 'показать все' }).click();
    await expect.poll(nodes).toBeGreaterThan(300);
    // Холст действительно нарисован.
    await expect
      .poll(async () =>
        canvas.evaluate((c) => {
          const el = c as HTMLCanvasElement;
          const d = el.getContext('2d')?.getImageData(0, 0, el.width, el.height).data ?? new Uint8ClampedArray();
          let painted = 0;
          for (let i = 3; i < d.length; i += 4) {
            painted += d[i] === 0 ? 0 : 1;
          }
          return painted;
        }),
      )
      .toBeGreaterThan(5000);
    await shot(page, 'graph-full.png');

    const all = await nodes();
    await page.getByTestId('graph-kind-file').click();
    await expect.poll(nodes).toBeLessThan(all);
    await page.getByRole('button', { name: 'показать все' }).click();
    await expect.poll(nodes).toBe(all);
    await page.getByRole('group', { name: 'Готовность эпох на графе' }).getByRole('button', { name: /^Не готово/ }).click();
    await expect.poll(nodes).toBeLessThan(all);
    await shot(page, 'graph-not-ready.png');
    await page.getByRole('group', { name: 'Готовность эпох на графе' }).getByRole('button', { name: 'Все', exact: true }).click();

    // Раскрытие всех эпох добавляет их файлы.
    await page.getByTestId('graph-expand-all').click();
    await expect.poll(nodes).toBeGreaterThan(all);

    // Поиск по графу → карточка узла → клик по узлу на холсте → переход на карту.
    await page.locator('#graph-search').fill('telegram-login');
    await page.getByTestId('graph-hit').filter({ hasText: 'POST /api/v1/auth/web/telegram-login' }).click();
    const cardNode = page.getByTestId('graph-node-card');
    await expect(cardNode).toContainText('Роут');
    await expect(cardNode).toContainText('Связи');
    await expect(canvas).toHaveAttribute('data-selected', /^route:/);
    await shot(page, 'graph-selected.png');
    // Камера поставила выбранный узел в центр: двойной клик по центру холста открывает его.
    const box = await canvas.boundingBox();
    if (box === null) {
      throw new Error('нет холста');
    }
    await page.waitForTimeout(300);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('api-route-card')).toContainText('/api/v1/auth/web/telegram-login');
  });
});

test.describe('тема', () => {
  test('T переключает светлую тему, выбор переживает перезагрузку', async ({ page }) => {
    await openKorbor(page, '&view=docs');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('t');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await shot(page, 'theme-light-docs.png');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
