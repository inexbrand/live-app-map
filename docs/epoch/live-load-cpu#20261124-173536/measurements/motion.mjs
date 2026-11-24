// Зум и панорама на стартовом виде «Весь Korbor» (живые экраны в кадре): FPS, долгие задачи, CPU.
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
const bcdp = await browser.newBrowserCDPSession();
const procs = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo;
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json');
await page.waitForTimeout(25000);
const VARIANT = process.env.VARIANT ?? 'none';
const CSS = { none: '', display: '.lam-moving .page-node__iframe{display:none}', visibility: '.lam-moving .page-node__iframe{visibility:hidden}', layer: '.page-node__iframe{will-change:transform}' }[VARIANT];
await page.addStyleTag({ content: CSS });
if (VARIANT === 'display' || VARIANT === 'visibility') await page.evaluate(() => { const h = document.querySelector('.flow-host'); let t = 0; const on = () => { h.classList.add('lam-moving'); clearTimeout(t); t = setTimeout(() => h.classList.remove('lam-moving'), 250); }; h.addEventListener('wheel', on, { capture: true, passive: true }); h.addEventListener('pointermove', (e) => { if (e.buttons) on(); }, { capture: true }); });
await page.waitForTimeout(1500);
const live = await page.evaluate(() => document.querySelectorAll('iframe').length);
async function frames(name, action) {
  const p0 = await procs();
  await page.evaluate(() => { const w = window; const gen = (w.__gen = (w.__gen ?? 0) + 1); w.__f = []; w.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {} const tick = (t) => { if (w.__gen !== gen) return; w.__f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now(); await action(); await page.waitForTimeout(600); const ms = Date.now() - t0;
  const { f, lt } = await page.evaluate(() => { const w = window; w.__gen++; return { f: w.__f, lt: w.__lt }; });
  const p1 = await procs();
  const cpu = p1.reduce((a, p) => a + p.cpuTime - (p0.find((q) => q.id === p.id)?.cpuTime ?? 0), 0);
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  const q = (x) => +(gaps[Math.floor(gaps.length * x)] ?? 0).toFixed(1);
  return { name, ms, fps: Math.round((f.length / ms) * 1000), p95: q(0.95), p99: q(0.99), max: +(gaps.at(-1) ?? 0).toFixed(1), longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), cores: +(cpu / (ms / 1000)).toFixed(2) };
}
await page.mouse.move(960, 520);
const runs = [];
for (let r = 0; r < 2; r++) {
  runs.push(await frames('зум колесом', async () => { for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, i < 8 ? 120 : -120); await page.waitForTimeout(40); } }));
  runs.push(await frames('панорама', async () => { for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1300 : 600, 520, { steps: 40 }); await page.mouse.up(); } }));
}
console.log(JSON.stringify({ label: VARIANT, liveIframes: live, runs }, null, 1));
await browser.close();
