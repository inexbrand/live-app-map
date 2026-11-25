import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe', headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const snaps: string[] = [];
p.on('response', (r) => { if (r.url().includes('__lam_snapshot')) snaps.push(r.status() + ''); });
await p.goto('http://localhost:4310/');
await p.waitForTimeout(3000);
if (await p.$('[data-testid="view-components"]') === null) { await p.getByRole('button', { name: /korbor/ }).first().click(); await p.waitForTimeout(4000); }
await p.click('[data-testid="view-components"]');
const state = () => p.$$eval('[data-testid="component-node"]', (els) => els.map((e) => {
  const c = e.querySelector('canvas');
  const img = e.querySelector('img[data-lam-snapshot]') as HTMLImageElement | null;
  const drawn = c !== null && getComputedStyle(c).opacity === '1';
  const shot = img !== null && img.complete && img.naturalWidth > 0;
  return { id: e.getAttribute('data-component-id'), drawn, shot };
}));
let s = await state();
for (let i = 0; i < 40 && (s.length === 0 || s.some((n) => !n.drawn && !n.shot)); i++) { await p.waitForTimeout(3000); s = await state(); }
await p.screenshot({ path: process.argv[2] });
console.log(JSON.stringify({ total: s.length, drawn: s.filter((n) => n.drawn).length, shot: s.filter((n) => !n.drawn && n.shot).length, empty: s.filter((n) => !n.drawn && !n.shot).map((n) => n.id), snapStatuses: snaps }, null, 1));
await b.close();
