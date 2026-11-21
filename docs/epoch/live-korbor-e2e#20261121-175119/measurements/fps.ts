import { chromium } from '/Users/macbook/orca/workspaces/live-app-map/wobbegong/node_modules/.bun/playwright@1.62.1/node_modules/playwright/index.mjs';
const label = process.argv[2] ?? 'run';
const browser = await chromium.launch({ headless: process.argv[3] !== 'headed', args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
if (process.argv[4]) await page.addStyleTag({ content: process.argv[4] });
async function measure(name, action) {
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => { const w = window; const gen = (w.__gen = (w.__gen ?? 0) + 1); w.__f = []; const tick = (t) => { if (w.__gen !== gen) return; w.__f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now();
  await action();
  const ms = Date.now() - t0;
  const f = await page.evaluate(() => { const w = window; w.__gen++; return w.__f; });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  const p = (q) => gaps[Math.floor(gaps.length * q)] ?? 0;
  return { name, ms, frames: f.length, fps: Math.round((f.length / ms) * 1000), p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), long: gaps.filter((g) => g > 50).length, layouts: m1.LayoutCount - m0.LayoutCount, styleRecalcs: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000) };
}
const out = [];
await page.mouse.move(800, 500);
out.push(await measure('панорама при старте (6 iframe)', async () => { for (let i = 0; i < 6; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1200 : 400, 500, { steps: 30 }); await page.mouse.up(); } }));
out.push(await measure('зум колесом', async () => { for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i < 6 ? 250 : -250); await page.waitForTimeout(60); } }));
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(80); }
await page.waitForTimeout(5000);
out.push(await measure('панорама в обзоре (≈49 нод)', async () => { for (let i = 0; i < 6; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1200 : 400, 500, { steps: 30 }); await page.mouse.up(); } }));
console.log(JSON.stringify({ label, out }, null, 1));
await browser.close();