/**
 * Снимок экрана: настоящий захват вкладки (Screen Capture API).
 * Chromium запускается с --auto-accept-this-tab-capture (playwright.config),
 * диалог выбора вкладки принимается сам.
 */
import { expect, test, type Page } from '@playwright/test';

async function openMiniappAndSelectNode(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('map-select').selectOption('korbor-miniapp');
  await expect.poll(async () => page.locator('.react-flow__node').count()).toBeGreaterThan(5);
  // Первая нода, целиком видимая под шапкой
  const box = await page.locator('.react-flow__node').evaluateAll((els) => {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.x >= 0 && r.y >= 70 && r.right < window.innerWidth && r.y + 20 < window.innerHeight) {
        return { x: r.x + Math.min(20, r.width / 2), y: r.y + 12 };
      }
    }
    return null;
  });
  expect(box).not.toBeNull();
  await page.mouse.click(box?.x ?? 0, box?.y ?? 0);
  await expect(page.getByRole('button', { name: 'Снимок', exact: true })).toBeVisible();
}

async function dragRegion(page: Page): Promise<void> {
  await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
  await page.mouse.move(420, 140);
  await page.mouse.down();
  await page.mouse.move(820, 440, { steps: 6 });
  await page.mouse.up();
}

async function mcpCall(page: Page, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await page.request.post('/mcp', {
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

test.describe('snapshot', () => {
  test('замечание: выделение области → PNG в панели', async ({ page }) => {
    await openMiniappAndSelectNode(page);
    await page.getByRole('button', { name: 'Снимок', exact: true }).click();
    await dragRegion(page);

    const shot = page.getByTestId('feedback-shot');
    await expect(shot).toBeVisible();
    const size = await shot.evaluate((img) => {
      const el = img as HTMLImageElement;
      return { w: el.naturalWidth, h: el.naturalHeight, png: el.src.startsWith('data:image/png;base64,') };
    });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(size).toEqual({ w: 400 * dpr, h: 300 * dpr, png: true });
    await expect(page.locator('.toast')).toContainText('добавлен к замечанию');

    // Esc отменяет новую сессию до захвата
    await page.getByRole('button', { name: 'Снимок', exact: true }).click();
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
