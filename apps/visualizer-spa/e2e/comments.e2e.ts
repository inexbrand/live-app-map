/**
 * Замечания к компонентам живых экранов (вариант Б3): выбранный экран сразу в
 * режиме выбора — клик по компоненту открывает окно у него; Enter отправляет;
 * агент видит и отвечает по MCP; лист «Все замечания» — «Проверьте» → «Принять».
 * Экраны — сайт korbor (:16001) в браузере трансляции; DOM страницы — через CDP.
 */
import { expect, test, type Page } from '@playwright/test';
import { mcpCall, openAndSelectNode } from './helpers';
import { blurActive } from './probes';
import { screenPage } from './stream-page';

/** Центр первой видимой кнопки или ссылки страницы экрана в координатах окна карты. */
async function componentPoint(page: Page, nodeId: string): Promise<{ x: number; y: number }> {
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  const canvas = node.locator('canvas[data-lam-screen]');
  let point: { x: number; y: number } | undefined;
  await expect(async () => {
    // Страницу ищем на каждой попытке: трансляция может переоткрыть вкладку экрана
    const screen = await screenPage(node);
    const inPage = await screen.evaluate(() => {
      const el = [...document.querySelectorAll('button, a[href]')].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 20 && r.height > 12 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      });
      if (el === undefined) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: window.innerWidth, h: window.innerHeight };
    });
    const box = await canvas.boundingBox();
    expect(inPage, `в экране ${nodeId} нет видимой кнопки или ссылки`).not.toBeNull();
    expect(box).not.toBeNull();
    if (inPage !== null && box !== null) {
      point = { x: box.x + (inPage.x * box.width) / inPage.w, y: box.y + (inPage.y * box.height) / inPage.h };
    }
  }).toPass({ timeout: 30_000 });
  if (point === undefined) {
    throw new Error('нет точки компонента');
  }
  return point;
}

type Listed = { readonly id: string; readonly page: { readonly id: string }; readonly element: { readonly selector: string } | null };

test.describe('замечания к компонентам', () => {
  test('клик по компоненту → окно → Enter → агент видит и отвечает → «Проверьте» → «Принять»', async ({ page }) => {
    test.setTimeout(120_000);
    const nodeId = await openAndSelectNode(page);
    // Клик, который выбрал экран, окна не открывает
    await expect(page.getByTestId('comment-popover')).toHaveCount(0);
    const p = await componentPoint(page, nodeId);
    // Как у пользователя: курсор над компонентом — рамка выбора в странице, потом клик
    const screen = await screenPage(page.locator(`.react-flow__node[data-id="${nodeId}"]`));
    await expect(async () => {
      await page.mouse.move(p.x, p.y - 1);
      await page.mouse.move(p.x, p.y);
      const shown = await screen.evaluate(() => {
        const box = document.querySelector<HTMLElement>('[data-lam-pick-box]');
        return box !== null && box.style.display !== 'none';
      });
      expect(shown, 'рамка выбора компонента не появилась').toBe(true);
    }).toPass({ timeout: 15_000 });
    await page.mouse.click(p.x, p.y);

    const pop = page.getByTestId('comment-popover');
    await expect(pop).toBeVisible({ timeout: 20_000 });
    const text = `e2e компонент ${Date.now()}`;
    await pop.getByRole('textbox', { name: 'Что не так' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Замечание отправлено агенту');

    // Агент видит замечание с привязкой к компоненту и снимок
    const listed = await mcpCall(page, 'list_comments', { stage: 'waiting', query: text });
    const items = listed['comments'] as Listed[];
    expect(items).toHaveLength(1);
    expect(items[0]?.page.id).toBe(nodeId);
    expect(items[0]?.element?.selector.length ?? 0).toBeGreaterThan(0);
    const id = items[0]?.id ?? '';
    const full = await mcpCall(page, 'get_comment', { id });
    expect(String((full['comment'] as { shotPath: string | null }).shotPath)).toMatch(/shot\.png$/);
    await expect(page.locator(`[data-testid=comment-marker][data-comment-id="${id}"]`)).toBeVisible();

    // Агент чинит и отвечает — замечание ждёт проверки пользователя
    await mcpCall(page, 'add_change_note', { commentId: id, text: 'Поправил отступ', files: ['src/x.tsx'] });
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await page.evaluate(blurActive);
    await page.keyboard.press('Shift+KeyC');
    const sheet = page.getByTestId('comments-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Поиск по замечаниям' }).fill(text);
    const item = sheet.getByRole('region', { name: 'Проверьте' }).getByTestId('sheet-item');
    await expect(item).toHaveCount(1, { timeout: 10_000 });
    await expect(item).toContainText('Поправил отступ');
    await item.getByRole('button', { name: 'Принять' }).click();
    await expect(item).toHaveCount(0);
    const done = await mcpCall(page, 'list_comments', { stage: 'done', query: text });
    expect(done['comments'] as unknown[]).toHaveLength(1);
  });

  test('W — замечание к экрану: пустое не отправляется, подсказка; Esc закрывает окно, потом снимает фокус', async ({ page }) => {
    await openAndSelectNode(page);
    await page.evaluate(blurActive);
    await page.keyboard.press('w');
    const pop = page.getByTestId('comment-popover');
    await expect(pop).toBeVisible();
    await pop.getByRole('button', { name: 'Отправить' }).click();
    await expect(pop.getByRole('alert')).toContainText('Напишите, что не так');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await page.evaluate(blurActive);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('focus-bar')).toHaveCount(0);
  });
});
