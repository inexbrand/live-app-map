const { chromium } = await import("file:///C:/work/live-app-map/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs");
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
const base = process.argv[2];
const waitMs = Number(process.argv[3] ?? 40000);
const browser = await chromium.launch({ executablePath: HELIUM, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let t0 = 0; const first = new Map(); let total = 0;
const syncs = [];
page.on('websocket', (ws) => ws.on('framesent', (f) => { if (t0 && typeof f.payload === 'string' && f.payload.startsWith('{"t":"sync"')) { const m = JSON.parse(f.payload); syncs.push([Date.now() - t0, m.screens.length, m.screens.filter(s => s.live).length]); } }));
const firstByKey = {};
page.on('websocket', (ws) => ws.on('framereceived', (f) => {
  if (typeof f.payload === 'string' || t0 === 0) return;
  const b = f.payload; const n = (b[0] << 8) | b[1]; const key = b.subarray(2, 2 + n).toString('utf8');
  total++; if (!first.has(key)) { first.set(key, Date.now() - t0); firstByKey[key] = Date.now() - t0; }
}));
await page.goto(base + '/', { waitUntil: 'load' });
await page.getByRole('button', { name: 'korbor', exact: true }).click();
t0 = Date.now();
while (Date.now() - t0 < waitMs) { await page.waitForTimeout(250); }
const canvases = await page.evaluate(() => document.querySelectorAll('canvas[data-lam-screen]').length);
const times = [...first.values()].sort((a, b) => a - b);
const at = (k) => times[k - 1] ?? null;
console.log(JSON.stringify({ canvases, keys: times.length, totalFrames: total, first: at(1), t4: at(4), t8: at(8), t12: at(12), last: times.at(-1) ?? null, syncs: syncs.slice(0, 12), firstByKey }));
await browser.close();
