const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe' });
const page = await browser.newPage();
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json');
await page.waitForTimeout(8000);
const out = await page.evaluate(async () => { const m = await import('/src/store/app-store.ts'); const s = m.useAppStore.getState(); const def = s.document.layout?.defaultDeviceViewport; return s.document.nodes.filter((n) => n.kind === 'page' || n.kind === 'not-found').map((n) => { const v = s.getNodeViewport(n.id) ?? def ?? { width: 390, height: 844 }; return { id: n.id, url: s.resolveLiveUrl(n.id), width: v.width, height: Math.min(v.height, 2000) }; }).filter((x) => x.url); });
console.log(JSON.stringify(out));
await browser.close();
