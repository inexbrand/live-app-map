/**
 * Снимок экрана: настоящий захват вкладки (Screen Capture API).
 * Chromium запускается с --auto-accept-this-tab-capture (playwright.config),
 * диалог выбора вкладки принимается сам.
 */
import { expect, test } from '@playwright/test';
import { dragRegion, mcpCall, openMiniappAndSelectNode, startRegion } from './helpers';

test.describe('snapshot', () => {
  test('замечание к области: выделение → PNG в поле → сохранено в ветке экрана', async ({ page }) => {
    await openMiniappAndSelectNode(page);
    const panel = page.getByTestId('screen-comments');
    await startRegion(page);
    await dragRegion(page);

    const composer = page.getByTestId('comment-composer');
    const shot = composer.getByTestId('comment-shot');
    await expect(shot).toBeVisible();
    const size = await shot.evaluate((img) => {
      const el = img as HTMLImageElement;
      return { w: el.naturalWidth, h: el.naturalHeight, png: el.src.startsWith('data:image/png;base64,') };
    });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(size).toEqual({ w: 400 * dpr, h: 300 * dpr, png: true });

    const text = `e2e область ${Date.now()}`;
    await composer.getByRole('textbox', { name: 'Что не так' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Замечание сохранено');
    const thread = panel.getByTestId('comment-thread').filter({ hasText: text });
    await expect(thread).toBeVisible();
    await expect(thread.locator('img')).toBeVisible();

    // Esc отменяет новую сессию до захвата
    await startRegion(page);
    await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('snapshot-overlay')).toHaveCount(0);
  });

  test('агент: request_snapshot по MCP → согласие → get_snapshot ready', async ({ page }) => {
    await openMiniappAndSelectNode(page);

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
