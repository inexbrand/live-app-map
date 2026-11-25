
const { chromium } = await import("file:///C:/work/live-app-map/node_modules/.bun/playwright-core@1.62.1//node_modules/playwright-core/index.mjs");
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
const [mode, target = 'h16002', N = '8', udd] = process.argv.slice(2);
const args = ['--ignore-certificate-errors', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
let browser, ctx;
if (udd) { ctx = await chromium.launchPersistentContext(udd, { executablePath: HELIUM, headless: true, args, ignoreHTTPSErrors: true }); browser = ctx.browser(); }
else { browser = await chromium.launch({ executablePath: HELIUM, headless: true, args }); ctx = await browser.newContext({ ignoreHTTPSErrors: true }); }
const bcdp = browser ? await browser.newBrowserCDPSession() : null;
const cpu = async () => bcdp ? (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((a, p) => a + p.cpuTime, 0) : 0;
let reqs = 0, fromCache = 0, bytes = 0;
ctx.on('requestfinished', async r => { reqs++; const s = await r.sizes().catch(() => null); if (s) bytes += s.responseBodySize; });
ctx.on('response', r => { if (r.fromServiceWorker() || r.status() === 304) fromCache++; });
const c0 = await cpu(); const t0 = Date.now();
const times = await Promise.all(Array.from({ length: +N }, async (_, i) => {
  const host = mode === 'cells' ? 'anon--' + target + '--c' + i : 'anon--' + target;
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('http://' + host + '.localhost:4320/?n=' + i, { waitUntil: 'load', timeout: 120000 });
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  return Date.now() - t0;
}));
const res = { mode, target, N: +N, persistent: !!udd, allReadyMs: Math.max(...times), firstMs: Math.min(...times), requests: reqs, status304: fromCache, MB: +(bytes / 1e6).toFixed(1), browserCpuS: +((await cpu()) - c0).toFixed(1) };
console.log(JSON.stringify(res));
await ctx.close(); if (browser && !udd) await browser.close();
