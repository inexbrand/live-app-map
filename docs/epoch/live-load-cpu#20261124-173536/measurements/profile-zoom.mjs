// Профиль основного потока на зуме колесом (карта на трансляции): self и inclusive по функциям.
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json');
await page.waitForTimeout(20000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.mouse.move(960, 520);
await cdp.send('Profiler.start');
for (let r = 0; r < 2; r++) {
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, i < 8 ? 120 : -120); await page.waitForTimeout(40); }
}
await page.waitForTimeout(600);
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const key = (n) => { const cf = n.callFrame; return (cf.functionName || '(anon)') + ' ' + cf.url.replace(/^.*\/(src|node_modules|deps)\//, '$1/').replace(/\?.*$/, '') + ':' + cf.lineNumber; };
const self = new Map(), incl = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const ms = (dt[i] ?? 0) / 1000;
  let id = profile.samples[i];
  const n0 = byId.get(id);
  self.set(key(n0), (self.get(key(n0)) ?? 0) + ms);
  const seen = new Set();
  while (id !== undefined) { const k = key(byId.get(id)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + ms); } id = parent.get(id); }
}
const fmt = (m) => [...m].filter(([k]) => !k.startsWith('(root)') && !k.startsWith('(program)') && !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => Math.round(v) + ' ms  ' + k).join('\n');
console.log('SELF\n' + fmt(self) + '\n\nINCL\n' + fmt(incl));
await browser.close();
