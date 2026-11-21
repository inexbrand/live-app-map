/**
 * Общие шаги e2e: открыть карту мини-приложения, выбрать экран, вызвать MCP.
 */
import { expect, type Page } from '@playwright/test';

/** Открывает карту korbor-miniapp и выбирает первую целиком видимую ноду. */
export async function openMiniappAndSelectNode(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('map-select').selectOption('korbor-miniapp');
  await expect.poll(async () => page.locator('.react-flow__node').count()).toBeGreaterThan(5);
  const box = await page.locator('.react-flow__node').evaluateAll((els) => {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.x >= 0 && r.y >= 70 && r.right < window.innerWidth && r.y + 20 < window.innerHeight) {
        return { x: r.x + Math.min(20, r.width / 2), y: r.y + 12, id: el.getAttribute('data-id') ?? '' };
      }
    }
    return null;
  });
  expect(box).not.toBeNull();
  await page.mouse.click(box?.x ?? 0, box?.y ?? 0);
  await expect(page.getByTestId('screen-comments')).toBeVisible();
  return box?.id ?? '';
}

/** Выделяет мышью область 400×300 в слое снимка. */
export async function dragRegion(page: Page): Promise<void> {
  await expect(page.getByTestId('snapshot-overlay')).toBeVisible();
  await page.mouse.move(420, 140);
  await page.mouse.down();
  await page.mouse.move(820, 440, { steps: 6 });
  await page.mouse.up();
}

/** Вызов инструмента MCP-сервера визуализатора; ответ — JSON из текста. */
export async function mcpCall(page: Page, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await page.request.post('/mcp', {
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Record<string, unknown>;
}
