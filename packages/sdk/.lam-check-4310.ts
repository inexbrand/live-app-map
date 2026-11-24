import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe', headless: true, args: ['--ignore-certificate-errors'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4310/');
await p.waitForTimeout(4000);
if (await p.$('[data-testid="view-components"]') === null) {
  await p.getByRole('button', { name: /korbor/ }).first().click();
  await p.waitForTimeout(4000);
}
await p.click('[data-testid="view-components"]');
await p.waitForTimeout(20000);
console.log('view?', await p.$('[data-testid="components-view"]') !== null, (await p.innerText('body')).slice(0, 300));
await p.waitForTimeout(12000);
const nodes = await p.$$eval('[data-testid="component-node"]', (els) => els.map((e) => ({ id: e.getAttribute('data-component-id'), canvas: e.querySelector('canvas') !== null })));
const titles = await p.$$eval('[data-testid="component-group-title"]', (e) => e.map((x) => x.textContent));
const err = await p.$eval('[data-testid="components-error"]', (e) => e.textContent).catch(() => null);
await p.screenshot({ path: process.argv[2] });
console.log(JSON.stringify({ count: nodes.length, live: nodes.filter((n) => n.canvas).length, titles, err, errs: errs.slice(0, 5) }, null, 1));
await b.close();
