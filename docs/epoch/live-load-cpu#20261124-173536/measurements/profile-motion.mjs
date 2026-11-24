// Профиль основного потока визуализатора во время зума и панорамы: самое дорогое по self time.
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json');
await page.waitForTimeout(25000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.mouse.move(960, 520);
await cdp.send('Profiler.start');
for (let r = 0; r < 2; r++) {
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, i < 8 ? 120 : -120); await page.waitForTimeout(40); }
  for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1300 : 600, 520, { steps: 40 }); await page.mouse.up(); }
}
await page.waitForTimeout(600);
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas; const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const cf = n.callFrame; const k = (cf.functionName || '(' + cf.url.split('/').pop() + ')') + ' ' + cf.url.replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '') + ':' + cf.lineNumber; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000); }
const total = [...self.values()].reduce((a, b) => a + b, 0);
const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => Math.round(v) + ' ms  ' + k);
console.log('total ' + Math.round(total) + ' ms\n' + top.join('\n'));
await browser.close();
