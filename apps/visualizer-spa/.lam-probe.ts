import { chromium } from '@playwright/test';
const exe = process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe';
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4531/?map=/__lam_project/map.json');
await p.locator('.page-node__title').first().waitFor({ timeout: 30000 });
await p.locator('.page-node__title').first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: process.argv[2] + '/click.png' });
const info = await p.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if ((cs.position === 'fixed' || cs.position === 'absolute') && r.width > 150 && r.height > 150 && !el.closest('.react-flow__node')) out.push(el.tagName + '.' + String(el.className).slice(0, 90) + ' ' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' testid=' + el.getAttribute('data-testid'));
  }
  return out.slice(0, 25).join('\n') + '\nURL ' + location.search + '\nfab ' + document.querySelectorAll('.diag-fab').length + ' minimap ' + document.querySelectorAll('.react-flow__minimap').length;
});
console.log(info);
await b.close();
