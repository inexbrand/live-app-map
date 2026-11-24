import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/imput/Helium/Application/chrome.exe', headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:4421/');
await p.waitForTimeout(5000);
await p.screenshot({ path: process.argv[2] });
console.log((await p.innerText('body')).slice(0, 800));
console.log(await p.$$eval('[data-testid]', (e) => e.map((x) => x.getAttribute('data-testid')).slice(0, 60).join(' ')));
await b.close();
