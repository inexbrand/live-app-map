import { chromium } from 'playwright-core';
const exe = process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe';
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4421/?view=components');
await p.waitForTimeout(4000);
const tab = await p.$('[data-testid="view-components"]');
if (tab === null) {
  // карта не открыта — откроем первую из каталога
  await p.getByRole('button', { name: /live-app-map/ }).first().click();
  await p.waitForTimeout(3000);
  await p.click('[data-testid="view-components"]');
} else {
  await tab.click();
}
await p.waitForSelector('[data-testid="component-node"]', { timeout: 15000 });
await p.waitForTimeout(9000);
const nodes = await p.$$eval('[data-testid="component-node"]', (els) => els.map((e) => ({ id: e.getAttribute('data-component-id'), canvas: e.querySelector('canvas') !== null, url: e.querySelector('canvas')?.getAttribute('data-lam-url') ?? null })));
await p.screenshot({ path: process.argv[2] });
console.log(JSON.stringify({ nodes, titles: await p.$$eval('[data-testid="component-group-title"]', (e) => e.map((x) => x.textContent)), errs }, null, 1));
await b.close();
