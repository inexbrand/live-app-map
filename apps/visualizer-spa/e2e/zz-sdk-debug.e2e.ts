import { expect, test } from '@playwright/test';
import { openAndSelectNode } from './helpers';
import { screenPage } from './stream-page';
test('debug', async ({ page }) => {
  test.setTimeout(120_000);
  const nodeId = await openAndSelectNode(page);
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  const screen = await screenPage(node);
  const logs: string[] = [];
  screen.on('console', (m) => logs.push(m.type() + ' ' + m.text().slice(0, 200)));
  screen.on('pageerror', (e) => logs.push('pageerror ' + String(e).slice(0, 300)));
  const info = await screen.evaluate(() => {
    const s = [...document.scripts].map((x) => x.textContent ?? '').find((t) => t.includes('installPicker'));
    let err: string | null = null;
    if (s !== undefined) { try { new Function(s); } catch (e) { err = String(e); } }
    const w = window as unknown as Record<string, unknown>;
    const decl = s === undefined ? [] : [...s.matchAll(/function (\w*componentNameOf\w*|\w*debugPlaceOf\w*|\w*fiberOf\w*|\w*appFrameOf\w*)\(/g)].map((m) => m[1]);
    const uses = s === undefined ? [] : [...new Set([...s.matchAll(/\b(\w+\d)\(/g)].map((m) => m[1]))];
    const ctx = s === undefined ? '' : s.slice(Math.max(0, s.indexOf('componentNameOf2') - 300), s.indexOf('componentNameOf2') + 60);
    return { decl, uses, ctx, url: location.href.slice(0, 120), hasScript: s !== undefined, err, keys: Object.keys(w).filter((k) => k.toLowerCase().includes('lam')) };
  });
  console.log('INFO ' + JSON.stringify(info));
  const box = await node.locator('canvas[data-lam-screen]').boundingBox();
  if (box !== null) { await page.mouse.click(box.x + box.width / 2, box.y + 60); }
  await page.waitForTimeout(3000);
  console.log('POP ' + await page.getByTestId('comment-popover').count());
  console.log('LOGS\n' + logs.join('\n'));
  await expect(page).toHaveURL(/./);
});
