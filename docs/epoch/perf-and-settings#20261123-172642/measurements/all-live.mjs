// Сценарий «все экраны живые»: снять лимиты, отдалить до обзора, замерить процессы, память, CPU, FPS и переходы.
// Запуск из корня: node <файл> <карта>
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright@1.62.1/node_modules/playwright/index.mjs');
import { execSync } from 'node:child_process';
const map = process.argv[2] ?? 'korbor-site';
const browser = await chromium.launch({ headless: false, args: ['--enable-gpu-rasterization','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('framenavigated', f => { if (f === page.mainFrame()) console.error('NAV main', f.url()); });
page.on('console', m => { if (/vite|reload/i.test(m.text())) console.error('CONSOLE', m.text().slice(0, 120)); });
const bcdp = await browser.newBrowserCDPSession();
await page.goto('http://localhost:4310/?map=/maps/' + map + '.liveappmap.json', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
const ok = await page.evaluate(async () => { const m = await import('/src/store/app-store.ts'); const s = m.useAppStore.getState(); s.setMaxLiveIframes(9999); s.setMaxWarmIframes(9999); window.__lam = m.useAppStore; return s.maxLiveIframes; });
const procs = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo;
const memMB = (ids) => { const out = execSync('powershell -NoProfile -Command "Get-Process -Id ' + ids.join(',') + ' -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum | % Sum"').toString().trim(); return Math.round(Number(out) / 1e6); };
const snap = async (step) => { const p = await procs(); const st = await page.evaluate(() => { const s = window.__lam.getState(); return { live: s.livePageIds.size, warm: s.warmPageIds.size, mounted: s.mountedPageIds.size, iframes: document.querySelectorAll('iframe').length }; }); return { step, procs: p.length, renderers: p.filter(x => x.type === 'renderer').length, memMB: memMB(p.map(x => x.id)), ...st }; };
async function frames(name, action) {
  const p0 = await procs();
  await page.evaluate(() => { const w = window; const gen = (w.__gen = (w.__gen ?? 0) + 1); w.__f = []; w.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {} const tick = t => { if (w.__gen !== gen) return; w.__f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now(); await action(); const ms = Date.now() - t0;
  const { f, lt } = await page.evaluate(() => { const w = window; w.__gen++; return { f: w.__f, lt: w.__lt }; });
  const p1 = await procs();
  const cpu = p1.reduce((a, p) => a + p.cpuTime - (p0.find(q => q.id === p.id)?.cpuTime ?? 0), 0);
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  const q = x => +(gaps[Math.floor(gaps.length * x)] ?? 0).toFixed(1);
  return { name, ms, fps: Math.round(f.length / ms * 1000), p95: q(0.95), p99: q(0.99), max: q(0.999), longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), cpuCoresAvg: +(cpu / (ms / 1000)).toFixed(2) };
}
const out = { map, budget: ok, steps: [], runs: [] };
out.steps.push(await snap('старт, лимиты сняты'));
await page.mouse.move(800, 500);
out.runs.push(await frames('отдаление до обзора (переходы в живые)', async () => { for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); } }));
out.runs.push(await frames('загрузка после отдаления 15 с', async () => { await page.waitForTimeout(15000); }));
out.steps.push(await snap('обзор, всё смонтировано'));
out.runs.push(await frames('простой 5 с', async () => { await page.waitForTimeout(5000); }));
out.runs.push(await frames('панорама', async () => { for (let i = 0; i < 6; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1200 : 400, 500, { steps: 30 }); await page.mouse.up(); } }));
out.runs.push(await frames('зум туда-обратно', async () => { for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i < 6 ? -250 : 250); await page.waitForTimeout(60); } }));
out.steps.push(await snap('конец'));
console.log(JSON.stringify(out, null, 1));
await browser.close();
