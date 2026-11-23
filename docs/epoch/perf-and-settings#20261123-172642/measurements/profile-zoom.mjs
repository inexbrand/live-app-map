// Профиль процессора главного потока при зуме и панораме. Запуск из корня: node <этот файл> <карта>
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright@1.62.1/node_modules/playwright/index.mjs');
const map = process.argv[2] ?? 'korbor-all';
const browser = await chromium.launch({ headless: false, args: ['--enable-gpu-rasterization','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto('http://localhost:4310/?map=/maps/' + map + '.liveappmap.json', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
await page.mouse.move(800, 500);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
const t0 = Date.now();
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i < 6 ? 250 : -250); await page.waitForTimeout(60); }
for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.mouse.move(i % 2 ? 1200 : 400, 500, { steps: 30 }); await page.mouse.up(); }
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas; const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const counts = new Map(); for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
const total = profile.samples.length; const usPer = (profile.endTime - profile.startTime) / total;
for (const [id, c] of counts) { const n = byId.get(id); const k = n.callFrame.functionName + ' ' + (n.callFrame.url.split('/').slice(-2).join('/')) + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) ?? 0) + c); }
// inclusive by our src files
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const incl = new Map();
for (const [id, c] of counts) { const seen = new Set(); let cur = id; while (cur !== undefined) { const n = byId.get(cur); const u = n.callFrame.url; if (u.includes('/src/') && !u.includes('node_modules')) { const k = n.callFrame.functionName + ' ' + u.split('/src/')[1] + ':' + n.callFrame.lineNumber; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + c); } } cur = parent.get(cur); } }
const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, c]) => Math.round(c * usPer / 1000) + 'ms ' + k);
console.log(JSON.stringify({ wallMs: Date.now() - t0, self: top(self), inclusiveOurs: top(incl) }, null, 1));
await browser.close();
