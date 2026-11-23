// Замер: процессы, FPS, долгие задачи, CPU по процессам. Запуск из корня: node <этот файл> <карта> [chrome] [пресет]
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright@1.62.1/node_modules/playwright/index.mjs');
const map = process.argv[2] ?? 'korbor-site';
const channel = process.argv[3] ?? undefined;
const browser = await chromium.launch({ headless: false, channel, args: ['--enable-gpu-rasterization','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const bcdp = await browser.newBrowserCDPSession();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto('http://localhost:4310/?map=/maps/' + map + '.liveappmap.json', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
if (process.argv[4]) { await page.locator('button', { hasText: /Настройки|Вид/ }).first().click().catch(()=>{}); await page.getByTestId('map-adaptive-select').selectOption(process.argv[4]); await page.keyboard.press('Escape'); await page.waitForTimeout(20000); }
const procs = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.map(p => ({ type: p.type, id: p.id, cpu: +p.cpuTime.toFixed(2) }));
const targets = (await bcdp.send('Target.getTargets')).targetInfos;
const domIframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => { try { return new URL(f.src).host } catch { return f.src } }));
async function measure(name, action) {
  const p0 = await procs();
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await page.evaluate(() => { const w = window; const gen = (w.__gen = (w.__gen ?? 0) + 1); w.__f = []; w.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {} const tick = t => { if (w.__gen !== gen) return; w.__f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now(); await action(); const ms = Date.now() - t0;
  const { f, lt } = await page.evaluate(() => { const w = window; w.__gen++; return { f: w.__f, lt: w.__lt }; });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const p1 = await procs();
  const cpu = p1.map(p => ({ type: p.type, id: p.id, cpuS: +(p.cpu - (p0.find(q => q.id === p.id)?.cpu ?? 0)).toFixed(2) })).filter(p => p.cpuS > 0.05).sort((a, b) => b.cpuS - a.cpuS);
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  const q = x => +(gaps[Math.floor(gaps.length * x)] ?? 0).toFixed(1);
  return { name, ms, fps: Math.round(f.length / ms * 1000), p50: q(0.5), p95: q(0.95), p99: q(0.99), framesOver50: gaps.filter(g => g > 50).length, longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), layouts: m1.LayoutCount - m0.LayoutCount, styleRecalcs: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), nodes: m1.Nodes, jsHeapMB: Math.round(m1.JSHeapUsedSize / 1e6), cpu };
}
const out = [];
await page.mouse.move(800, 500);
out.push(await measure('idle 5s', async () => { await page.waitForTimeout(5000); }));
out.push(await measure('pan', async () => { for (let i = 0; i < 6; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1200 : 400, 500, { steps: 30 }); await page.mouse.up(); } }));
out.push(await measure('zoom', async () => { for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i < 6 ? 250 : -250); await page.waitForTimeout(60); } }));
const after = await procs();
console.log(JSON.stringify({ map, channel, processes: after.map(p=>p.type), targets: targets.map(t => ({ type: t.type, url: t.url.slice(0, 70) })), domIframes, out }, null, 1));
await browser.close();
