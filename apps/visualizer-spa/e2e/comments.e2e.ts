/**
 * Замечания к компонентам живых экранов: выбор компонента в странице (C),
 * текст, сохранение; ответ агента через MCP; ветка, статус, список и переход.
 * Нужен живой korbor (страницы мини-приложения через шлюз).
 */
import { expect, test, type Page } from '@playwright/test';
import { mcpCall, openMiniappAndSelectNode } from './helpers';

/** Центр первой целиком видимой живой страницы на холсте. */
async function visibleFrame(page: Page): Promise<{ id: string; x: number; y: number }> {
  await expect(page.locator('iframe[data-lam-node-iframe]').first()).toBeVisible({ timeout: 60_000 });
  const f = await page.locator('iframe[data-lam-node-iframe]').evaluateAll((els) => {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // Между левой панелью замечаний (~410) и правой панелью экрана (~400); верх страницы виден
      if (r.x > 420 && r.right < window.innerWidth - 400 && r.y > 80 && r.y + 100 < window.innerHeight && r.width > 100) {
        return { id: el.getAttribute('data-lam-node-iframe') ?? '', x: r.x + r.width / 2, y: r.y + 70 };
      }
    }
    return null;
  });
  expect(f).not.toBeNull();
  return f ?? { id: '', x: 0, y: 0 };
}

/**
 * C — выбор компонента. Просьба снимка от агента (её шлёт параллельный
 * snapshot.e2e, состояние агента общее на сервер) занимает сессию — закрываем.
 */
async function startPick(page: Page): Promise<void> {
  await expect(async () => {
    const agentCard = page.getByRole('dialog', { name: 'Просьба агента' });
    if (await agentCard.isVisible()) {
      await agentCard.getByRole('button', { name: 'Отмена' }).click();
    }
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await page.keyboard.press('c');
    await expect(page.getByTestId('pick-hint')).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
}

test.describe('замечания к компонентам', () => {
  test('C → клик по компоненту → текст → MCP-агент отвечает → в UI ответ и статус → список и переход', async ({ page }) => {
    test.setTimeout(120_000);
    await openMiniappAndSelectNode(page);
    // Живые страницы должны прогрузиться: пикер ставит шлюз
    await page.waitForTimeout(4000);
    const frame = await visibleFrame(page);

    await startPick(page);
    await page.mouse.move(frame.x, frame.y, { steps: 4 });
    await page.mouse.click(frame.x, frame.y);

    const composer = page.getByTestId('comment-composer');
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('pick-hint')).toHaveCount(0);
    const text = `e2e компонент ${Date.now()}`;
    await composer.getByRole('textbox', { name: 'Что не так' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Замечание сохранено');

    // Агент видит замечание с привязкой к компоненту
    const listed = await mcpCall(page, 'list_comments', { status: 'open', query: text });
    const items = listed['comments'] as Array<{ id: string; page: { id: string }; element: { selector: string; component: string | null; source: { file: string } | null } | null }>;
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item?.page.id).toBe(frame.id);
    expect(item?.element?.selector.length ?? 0).toBeGreaterThan(0);
    expect(item?.element?.component ?? '').not.toBe('');
    expect(item?.element?.source?.file ?? '').toMatch(/\.tsx$/);
    const id = item?.id ?? '';
    const full = await mcpCall(page, 'get_comment', { id });
    expect(String(full['comment'] && (full['comment'] as { shotPath: string | null }).shotPath)).toMatch(/shot\.png$/);

    // Метка на ноде и счётчик в шапке
    await expect(page.locator(`[data-testid=comment-marker][data-comment-id="${id}"]`)).toBeVisible();
    await expect(page.getByTestId('open-comments-count')).toBeVisible();

    // Агент чинит и отвечает
    const reply = await mcpCall(page, 'add_change_note', { commentId: id, text: 'Поправил отступ карточки', files: ['src/features/x.tsx'] });
    expect((reply['comment'] as { status: string }).status).toBe('fixed');

    const thread = page.getByTestId('screen-comments').locator(`[data-testid=comment-thread][data-comment-id="${id}"]`);
    await expect(thread).toHaveAttribute('data-status', 'fixed', { timeout: 10_000 });
    await expect(thread.getByTestId('comment-reply')).toContainText('Поправил отступ карточки');
    await expect(thread.getByTestId('comment-status')).toContainText('Исправлено');

    // Пользователь открывает снова — агент видит
    await thread.getByRole('button', { name: 'Открыть снова' }).click();
    await expect(thread).toHaveAttribute('data-status', 'open');
    const again = await mcpCall(page, 'list_comments', { status: 'open', query: text });
    expect(again['comments'] as unknown[]).toHaveLength(1);

    // Общий список: фильтр по тексту, переход к экрану
    await page.getByTestId('open-comments').click();
    const list = page.getByTestId('comments-list');
    await expect(list).toBeVisible();
    await list.getByRole('textbox', { name: 'Поиск по замечаниям' }).fill(text);
    await expect(list.getByTestId('comments-list-item')).toHaveCount(1);
    await list.getByRole('radio', { name: 'Исправленные' }).click();
    await expect(list.getByTestId('comments-list-item')).toHaveCount(0);
    await list.getByRole('radio', { name: 'Все' }).click();
    await list.getByTestId('comments-list-item').click();
    await expect(page.getByTestId('screen-comments').locator(`[data-comment-id="${id}"]`)).toHaveClass(/comment-thread--focus/);
  });

  test('пустое замечание не сохраняется: подсказка, что вписать', async ({ page }) => {
    await openMiniappAndSelectNode(page);
    await page.getByTestId('screen-comments').getByRole('button', { name: 'Область' }).click();
    await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
    await page.mouse.move(420, 140);
    await page.mouse.down();
    await page.mouse.move(700, 340, { steps: 4 });
    await page.mouse.up();
    const composer = page.getByTestId('comment-composer');
    await expect(composer).toBeVisible();
    await composer.getByRole('button', { name: 'Сохранить' }).click();
    await expect(composer.getByRole('alert')).toContainText('Напишите, что не так');
    await page.keyboard.press('Escape');
    await expect(composer).toHaveCount(0);
  });
});
