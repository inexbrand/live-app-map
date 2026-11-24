// Живая проверка ввода через трансляцию: клик в экран меняет кадр, пикер компонента открывает черновик замечания.
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe', headless: false, args: ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1040 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4310/?map=/maps/korbor-miniapp.liveappmap.json');
await page.waitForTimeout(15000);
const id = await page.evaluate(() => [...document.querySelectorAll('canvas[data-lam-screen]')].find((c) => c.style.opacity === '1' && c.getBoundingClientRect().width > 100 && c.getBoundingClientRect().top > 60)?.getAttribute('data-lam-screen') ?? null);
if (id === null) { console.log(JSON.stringify({ error: 'нет нарисованного холста', errors })); await browser.close(); process.exit(1); }
const sel = 'canvas[data-lam-screen="' + id.replace(/"/g, '\\"') + '"]';
const hash = () => page.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; }, sel);
const box = async () => page.locator(sel).boundingBox();
async function changedWithin(ms, action) {
  const h0 = await hash(); const t0 = Date.now(); await action();
  while (Date.now() - t0 < ms) { if ((await hash()) !== h0) return Date.now() - t0; await page.waitForTimeout(10); }
  return -1;
}
const result = { id };
// Пикер: кнопка замечания у ноды, наведение — подсветка в кадре, клик — черновик
const node = page.locator('.page-node[data-page-id="' + id.replace(/"/g, '\\"') + '"]');
await node.hover();
await node.locator('[data-testid="node-comment"]').click();
await page.waitForTimeout(800);
let b = await box();
result.pickHoverMs = await changedWithin(2000, () => page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.3, { steps: 5 }));
await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.3);
await page.waitForTimeout(1500);
result.composer = await page.locator('[data-testid="comment-composer"]').count();
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
// Работа с приложением: двойной клик по ноде, затем клик по экрану
await node.dblclick({ position: { x: 20, y: 10 } });
await page.waitForTimeout(500);
b = await box();
result.interact = await page.locator(sel + '.page-node__screen--interact').count();
result.canvasClass = await page.locator(sel).getAttribute('class');
result.anyInteract = await page.locator('.page-node__screen--interact').count();
const clicks = [];
for (const fy of [0.2, 0.5, 0.8]) { clicks.push(await changedWithin(3000, () => page.mouse.click(b.x + b.width * 0.5, b.y + b.height * fy))); await page.waitForTimeout(700); }
result.clickToFrameMs = clicks;
result.iframes = await page.locator('iframe').count();
result.errors = errors;
await page.screenshot({ path: process.env.SHOT ?? 'verify-input.png' });
console.log(JSON.stringify(result));
await browser.close();
