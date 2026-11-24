/**
 * Снимок экрана: настоящий захват вкладки (Screen Capture API).
 * Chromium запускается с --auto-accept-this-tab-capture (playwright.config),
 * диалог выбора вкладки принимается сам.
 */
import { expect, test } from '@playwright/test';
import { dragRegion, mcpCall, openAndSelectNode, startRegion } from './helpers';

test.describe('snapshot', () => {
  test('замечание к области: ⌥⇧S → выделение → окно к экрану → отправлено со снимком', async ({ page }) => {
    await openAndSelectNode(page);
    await startRegion(page);
    await dragRegion(page);

    const pop = page.getByTestId('comment-popover');
    await expect(pop).toBeVisible();
    const text = `e2e область ${Date.now()}`;
    await pop.getByRole('textbox', { name: 'Что не так' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Замечание отправлено агенту');
    const listed = await mcpCall(page, 'list_comments', { query: text });
    const id = (listed['comments'] as Array<{ id: string }>)[0]?.id ?? '';
    const full = await mcpCall(page, 'get_comment', { id });
    expect(String((full['comment'] as { shotPath: string | null }).shotPath)).toMatch(/shot\.png$/);

    // Esc отменяет новую сессию до захвата, фокус экрана остаётся
    await page.keyboard.press('Escape');
    await startRegion(page);
    await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('snapshot-overlay')).toHaveCount(0);
    await expect(page.getByTestId('focus-bar')).toBeVisible();
  });

  test('агент: request_snapshot по MCP → согласие → get_snapshot ready', async ({ page }) => {
    await openAndSelectNode(page);

    // Визуализатор публикует состояние для get_visualizer_state
    await expect
      .poll(async () => {
        const s = await mcpCall(page, 'get_visualizer_state', {});
        const state = s['state'] as { selectedPage?: { id?: string } | null } | undefined;
        return state?.selectedPage?.id ?? null;
      })
      .not.toBeNull();

    const req = await mcpCall(page, 'request_snapshot', { note: 'e2e: шапка карты' });
    const requestId = (req['request'] as { id: string }).id;

    const card = page.getByRole('dialog', { name: 'Просьба агента' });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('e2e: шапка карты');
    await card.getByRole('button', { name: 'Снять' }).click();
    await dragRegion(page);
    await expect(page.locator('.toast')).toContainText('Снимок отправлен агенту');

    const snap = await mcpCall(page, 'get_snapshot', { requestId });
    expect(snap['status']).toBe('ready');
    expect(String((snap['snapshot'] as { file: string }).file)).toMatch(/\.png$/);
  });
});
