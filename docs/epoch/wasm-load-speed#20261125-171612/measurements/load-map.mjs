
const { chromium } = await import("file:///C:/work/live-app-map/node_modules/.bun/playwright-core@1.62.1//node_modules/playwright-core/index.mjs");
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
const base = process.argv[2] ?? 'http://localhost:4310';
const browser = await chromium.launch({ executablePath: HELIUM, headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1040 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const t0 = Date.now(); const marks = {}; const mark = k => { if (!(k in marks)) marks[k] = Date.now() - t0; };
const log = [];
page.on('response', r => { const p = new URL(r.url()).pathname; if (!p.startsWith('/src/') && !p.startsWith('/node_modules/') && !p.startsWith('/@fs')) log.push([Date.now() - t0, r.status(), p.slice(0, 70), r.headers()['content-length']]); });
await page.getByRole('button', { name: 'korbor', exact: true }).click(); mark('click');
let longest = 0;
while (Date.now() - t0 < 30000) {
  const a = Date.now();
  const s = await page.evaluate(() => ({ n: document.querySelectorAll('.react-flow__node').length, c: document.querySelectorAll('canvas[data-lam-screen]').length, img: document.querySelectorAll('.react-flow__node img').length }));
  longest = Math.max(longest, Date.now() - a);
  if (s.n > 0) mark('nodes'); if (s.c > 0) mark('canvas'); if (s.img > 0) mark('img');
  marks.last = s; await page.waitForTimeout(100);
}
marks.longestEvalRoundtripMs = longest;
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map(); const byFile = new Map(); let total = 0;
profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame; const file = (f.url.split('?')[0].split('/').slice(-2).join('/') || '(' + f.functionName + ')');
  const d = profile.timeDeltas[i] / 1000; total += d; const k = f.functionName + ' @ ' + file; self.set(k, (self.get(k) ?? 0) + d); byFile.set(file, (byFile.get(file) ?? 0) + d); });
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ' ' + v.toFixed(0) + 'ms');
const lt = await page.evaluate(() => 0);
await page.screenshot({ path: "C:/Users/Concept/AppData/Local/Temp/claude/753367833d678936/4cffdc2b-4185-4f5f-bcc7-099228f97712/scratchpad/map.png" });
console.log(JSON.stringify({ marks, totalMs: Math.round(total), topSelf: top(self, 30), topFile: top(byFile, 20), log: log.slice(0, 40) }, null, 1));
await browser.close();
