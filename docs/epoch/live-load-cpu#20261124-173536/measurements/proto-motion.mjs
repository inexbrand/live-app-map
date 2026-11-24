// Прототип трансляции: то же движение, что motion.mjs, + CPU headless и сервера + задержка клика.
import { execSync } from 'node:child_process';
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const base = process.argv[2] ?? 'http://localhost:4330';
const osCpu = () => JSON.parse(execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'^(bun|chrome)\\.exe$\' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ id = $_.ProcessId; cmd = [string]$_.CommandLine; cpu = [double]$p.CPU; ws = [double]$p.WorkingSet64 } } | ConvertTo-Json -Compress"', { maxBuffer: 64e6 }).toString());
const grp = (p) => (p.cmd.includes('--headless') ? 'headless' : p.cmd.includes('server.ts') ? 'server' : 'other');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
const bcdp = await browser.newBrowserCDPSession();
const procs = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo;
await page.goto(base);
await page.waitForTimeout(25000);
async function frames(name, action) {
  const p0 = await procs(); const o0 = osCpu();
  await page.evaluate(() => { const w = window; const gen = (w.__gen = (w.__gen ?? 0) + 1); w.__f = []; w.__lt = []; w.__fr0 = w.__frames; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {} const tick = (t) => { if (w.__gen !== gen) return; w.__f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now(); await action(); await page.waitForTimeout(600); const ms = Date.now() - t0;
  const { f, lt, fr } = await page.evaluate(() => { const w = window; w.__gen++; return { f: w.__f, lt: w.__lt, fr: w.__frames - w.__fr0 }; });
  const p1 = await procs(); const o1 = osCpu();
  const cpu = p1.reduce((a, p) => a + p.cpuTime - (p0.find((q) => q.id === p.id)?.cpuTime ?? 0), 0);
  const og = {}; for (const p of o1) { const g = grp(p); if (g === 'other') continue; og[g] = +((og[g] ?? 0) + (p.cpu - (o0.find((q) => q.id === p.id)?.cpu ?? p.cpu)) / (ms / 1000)).toFixed(2); }
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  const q = (x) => +(gaps[Math.floor(gaps.length * x)] ?? 0).toFixed(1);
  return { name, fps: Math.round((f.length / ms) * 1000), p99: q(0.99), max: +(gaps.at(-1) ?? 0).toFixed(1), longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), coresClient: +(cpu / (ms / 1000)).toFixed(2), coresOs: og, framesIn: fr };
}
await page.mouse.move(960, 520);
const runs = [];
for (let r = 0; r < 2; r++) {
  runs.push(await frames('зум колесом', async () => { for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, i < 8 ? 120 : -120); await page.waitForTimeout(40); } }));
  runs.push(await frames('панорама', async () => { for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1300 : 600, 520, { steps: 40 }); await page.mouse.up(); } }));
}
runs.push(await frames('простой 5 с', async () => { await page.waitForTimeout(5000); }));
await page.screenshot({ path: process.env.SHOT ?? 'proto.png' });
// наведение на кнопку и уход с неё: hover перекрашивает кнопку — кадр точно будет
const lat = []; for (let i = 0; i < 8; i++) { lat.push(Math.round(await page.evaluate(([k, on]) => new Promise((res) => { const t = performance.now(); window.__waitFrame(k, () => res(performance.now() - t)); window.__mark(k, on); setTimeout(() => res(-1), 3000); }), [i % 4, i % 2 === 0]))); await page.waitForTimeout(400); }
const mem = osCpu().reduce((a, p) => { const g = grp(p); if (g !== 'other') a[g] = Math.round((a[g] ?? 0) + p.ws / 1e6); return a; }, {});
const stats = await (await fetch(base + '/stats')).json();
console.log(JSON.stringify({ runs, clickToFrameMs: lat, memMB: mem, stats }, null, 1));
await browser.close();
