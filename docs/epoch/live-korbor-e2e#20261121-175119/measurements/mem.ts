import { chromium } from '/Users/macbook/orca/workspaces/live-app-map/wobbegong/node_modules/.bun/playwright@1.62.1/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const label = process.argv[2] ?? 'run';
const dir = mkdtempSync(path.join(tmpdir(), 'lam-mem-'));
const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1600, height: 1000 }, headless: true });
const page = ctx.pages()[0] ?? (await ctx.newPage());
function tree() {
  const rows = execSync('ps -axo pid=,ppid=,rss=,command=').toString().split('\n').filter(Boolean).map((l) => { const [pid, ppid, rss, ...cmd] = l.trim().split(/\s+/); return { pid: Number(pid), ppid: Number(ppid), rss: Number(rss), cmd: cmd.join(' ') }; });
  const roots = rows.filter((r) => r.cmd.includes(dir) && !rows.some((p) => p.pid === r.ppid && p.cmd.includes(dir)));
  const ids = new Set(roots.map((r) => r.pid));
  let grew = true;
  while (grew) { grew = false; for (const r of rows) if (!ids.has(r.pid) && ids.has(r.ppid)) { ids.add(r.pid); grew = true; } }
  return rows.filter((r) => ids.has(r.pid));
}
function rssMb() { return Math.round(tree().reduce((s, r) => s + r.rss, 0) / 1024); }
async function frames() {
  return page.evaluate(() => ({ iframes: document.querySelectorAll('iframe').length, live: document.querySelectorAll('[data-lam-live="1"]').length, nodes: document.querySelectorAll('[data-lam-node]').length, imgs: document.querySelectorAll('img[data-lam-snapshot]').length }));
}
const rows = [];
const cdp = await ctx.newCDPSession(page);
async function mark(step) {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(1500);
  const heap = await cdp.send('Runtime.getHeapUsage');
  rows.push({ step, rssMb: rssMb(), heapMb: Math.round(heap.usedSize / 1048576), procs: tree().length, ...(await frames()) });
}
await page.goto('http://localhost:4310/?map=/maps/korbor-all.liveappmap.json', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
await mark('старт korbor-all');
// обзор: отдалить и пройти по карте
const box = { x: 800, y: 500 };
await page.mouse.move(box.x, box.y);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(400); }
await page.waitForTimeout(8000);
await mark('отдалили (обзор)');
for (let i = 0; i < 10; i++) { const dx = i < 5 ? -700 : 700; await page.mouse.move(800, 500); await page.mouse.down(); await page.mouse.move(800 + dx, 500, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(1500); }
await page.waitForTimeout(8000);
await mark('панорама 10 шагов');
for (let k = 0; k < Number(process.argv[3] ?? 4); k++) {
  await page.getByTestId('map-select').selectOption('korbor-miniapp');
  await page.waitForTimeout(6000);
  await page.getByTestId('map-select').selectOption('korbor-all');
  await page.waitForTimeout(6000);
}
await page.waitForTimeout(6000);
await mark('после 4 переключений карт');
console.log(JSON.stringify({ label, rows }));
await ctx.close();