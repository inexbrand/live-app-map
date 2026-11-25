
const { chromium } = await import("file:///C:/work/live-app-map/node_modules/.bun/playwright-core@1.62.1//node_modules/playwright-core/index.mjs");
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
const base = process.argv[2] ?? 'http://localhost:4310';
const browser = await chromium.launch({ executablePath: HELIUM, headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1040 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const marks = {}; const t0 = Date.now(); const mark = k => { if (!(k in marks)) marks[k] = Date.now() - t0; };
let reqN = 0, bytes = 0; const big = [];
page.on('response', async r => { reqN++; const l = Number(r.headers()['content-length'] ?? 0); bytes += l; if (l > 200000) big.push([new URL(r.url()).pathname, l]); });
await page.goto(base + '/', { waitUntil: 'load' }); mark('load');
const btn = page.getByRole('button', { name: /korbor/i }).first();
if (await btn.isVisible({ timeout: 8000 }).catch(() => false)) { mark('picker'); await btn.click(); mark('clicked'); }
const until = Date.now() + 60000;
while (Date.now() < until) {
  const s = await page.evaluate(() => ({ n: document.querySelectorAll('.react-flow__node').length, c: document.querySelectorAll('canvas[data-lam-screen]').length, img: document.querySelectorAll('.react-flow__node img').length }));
  if (s.n > 0) mark('firstNodes:' + s.n);
  if (s.c > 0) mark('firstCanvas');
  marks.last = s;
  if (Date.now() - t0 > 25000) break;
  await page.waitForTimeout(100);
}
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map(); const dt = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const file = (f.url.split('?')[0].split('/').slice(-2).join('/') || '(' + f.functionName + ')');
  const k = f.functionName + ' @ ' + file; const d = dt[i] / 1000; total += d; self.set(k, (self.get(k) ?? 0) + d); });
const byFile = new Map(); for (const [k, v] of self) { const f = k.split(' @ ')[1]; byFile.set(f, (byFile.get(f) ?? 0) + v); }
const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' ' + v.toFixed(0) + 'ms');
const perf = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.duration > 300 || e.transferSize > 200000).map(e => [e.name.slice(-70), Math.round(e.startTime), Math.round(e.duration), e.transferSize]));
console.log(JSON.stringify({ marks, reqN, bytes, big, totalProfiledMs: Math.round(total), topSelf: top(self), topFile: top(byFile), slowRes: perf.slice(0, 30) }, null, 1));
await browser.close();
