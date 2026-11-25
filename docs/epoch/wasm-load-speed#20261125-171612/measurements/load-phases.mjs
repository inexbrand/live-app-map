
const { chromium } = await import("file:///C:/work/live-app-map/node_modules/.bun/playwright-core@1.62.1//node_modules/playwright-core/index.mjs");
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
const base = process.argv[2] ?? 'http://localhost:4310';
const browser = await chromium.launch({ executablePath: HELIUM, headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1040 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const t0 = Date.now(); const log = [];
page.on('response', r => { const p = new URL(r.url()).pathname; if (!p.startsWith('/src/') && !p.startsWith('/node_modules/')) log.push([Date.now() - t0, r.status(), p.slice(0, 80)]); });
await page.goto(base + '/', { waitUntil: 'load' });
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { reqStart: n.requestStart, respStart: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
await page.waitForTimeout(15000);
await page.screenshot({ path: "C:/Users/Concept/AppData/Local/Temp/claude/753367833d678936/4cffdc2b-4185-4f5f-bcc7-099228f97712/scratchpad/load.png" });
const dom = await page.evaluate(() => ({ title: document.title, nodes: document.querySelectorAll('.react-flow__node').length, canv: document.querySelectorAll('canvas').length, btns: [...document.querySelectorAll('button')].slice(0, 15).map(b => b.textContent.trim().slice(0, 30)) }));
console.log(JSON.stringify({ nav, dom, log: log.slice(0, 60) }, null, 1));
await browser.close();
