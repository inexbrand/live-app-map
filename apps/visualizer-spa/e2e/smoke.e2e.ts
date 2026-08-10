/**
 * Smoke e2e: пресет Korbor Miniapp → nodes > 0 → роль recruiter в status/Live URL.
 */
import { expect, test } from '@playwright/test';

test.describe('visualizer smoke', () => {
  test('load Korbor Miniapp preset → nodes > 0 → role recruiter', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Live App Map' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Korbor Miniapp' }).click();

    const statusBar = page.locator('footer.status-bar');
    await expect(statusBar).toBeVisible();

    // nodes: N в status-bar — после load пресета N > 0
    await expect
      .poll(async () => {
        const text = await statusBar.innerText();
        const match = text.match(/nodes:\s*(\d+)/);
        return match ? Number(match[1]) : 0;
      })
      .toBeGreaterThan(0);

    await expect(statusBar).toContainText(/mode:\s*live/);

    // Роль recruiter: select в тулбаре → status-bar role: recruiter
    const roleSelect = page.locator('header.toolbar label.field', {
      hasText: 'Роль',
    }).locator('select');
    await roleSelect.selectOption('recruiter');
    await expect(statusBar).toContainText(/role:\s*recruiter/);

    // Выбрать первую ноду → Live URL содержит lam_role=recruiter
    const firstNode = page.locator('.react-flow__node').first();
    await expect(firstNode).toBeVisible();
    await firstNode.click();

    const liveUrl = page.locator('#live-url');
    await expect(liveUrl).toBeVisible();
    await expect(liveUrl).toHaveValue(/lam_role=recruiter/);
  });
});
