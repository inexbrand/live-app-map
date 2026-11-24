const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json');
await page.waitForTimeout(4000);
const st = () => page.evaluate(async () => { const m = await import('/src/store/app-store.ts'); const s = m.useAppStore.getState(); return { zoom: +s.cameraZoom.toFixed(3), scale: s.iframeScale, maxLive: s.maxLiveIframes, visible: s.visiblePageIds.size, live: s.livePageIds.size, warm: s.warmPageIds.size, mounted: s.mountedPageIds.size, iframes: document.querySelectorAll('iframe').length, rfZoom: document.querySelector('.react-flow__viewport')?.style.transform }; });
const out = { start: await st() };
await page.mouse.move(960, 520);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(120); }
await page.waitForTimeout(3000);
out.zoomedOut = await st();
for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(120); }
await page.waitForTimeout(3000);
out.zoomedBackIn = await st();
console.log(JSON.stringify(out, null, 1));
await browser.close();
