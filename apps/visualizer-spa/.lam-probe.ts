import { chromium } from '@playwright/test';
const exe = process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe';
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://127.0.0.1:4531/?map=/__lam_project/map.json');
const node = p.locator('[data-lam-node="miniapp:route:/feed"]');
await node.locator('.page-node__title').click();
await node.locator('canvas[data-lam-screen]').waitFor({ state: 'attached', timeout: 30000 });
const url = await node.locator('canvas[data-lam-screen]').getAttribute('data-lam-url');
console.log('canvas url', url);
const s = await chromium.connectOverCDP('http://127.0.0.1:9531');
for (let i = 0; i < 5; i++) {
  const pages = s.contexts().flatMap((c) => c.pages());
  const urls = pages.map((x) => x.url());
  const feed = pages.filter((x) => x.url().startsWith((url ?? '').split('#')[0]));
  console.log(i, 'pages', pages.length, 'matching', feed.map((x) => x.url()).join(' , '));
  for (const f of feed) console.log('   scroller', await f.locator('.tab-canvas__scroll').count().catch((e) => 'ERR ' + String(e).slice(0, 60)), 'title', await f.title().catch(() => '?'));
  await p.waitForTimeout(3000);
}
await b.close();
process.exit(0);
