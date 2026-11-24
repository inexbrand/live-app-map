// Прогрузка карты: кто ест CPU первые N секунд. Helium (headed), карта по умолчанию, настройки по умолчанию.
// Запуск из корня: node <файл> [карта] [секунды] [url визуализатора]
import { execSync } from 'node:child_process';
const { chromium } = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/.bun/playwright-core@1.62.1/node_modules/playwright-core/index.mjs');
const map = process.argv[2] ?? 'korbor-all';
const secs = Number(process.argv[3] ?? 40);
const base = process.argv[4] ?? 'http://localhost:4310';
const HELIUM = process.env.LOCALAPPDATA + '\\imput\\Helium\\Application\\chrome.exe';
// CPU (с) процессов ОС по группам: visualizer-браузер не считаем тут — он из CDP.
const osCpu = () => JSON.parse(execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'^(bun|node|chrome|esbuild)\\.exe$\' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ id = $_.ProcessId; name = $_.Name; cmd = [string]$_.CommandLine; cpu = [double]$p.CPU } } | ConvertTo-Json -Compress"', { maxBuffer: 64e6 }).toString());
const group = (p) => {
  const c = p.cmd;
  if (p.name === 'chrome.exe') return c.includes('--headless') ? 'снимки (headless Helium)' : 'браузер пользователя/замера';
  if (/korbor/i.test(c) && /miniapp/i.test(c)) return 'korbor miniapp vite';
  if (/korbor/i.test(c) && /admin/i.test(c)) return 'korbor admin vite';
  if (/korbor/i.test(c) && /site|next/i.test(c)) return 'korbor site next';
  if (/korbor/i.test(c) && /api/i.test(c)) return 'korbor api';
  if (/korbor/i.test(c)) return 'korbor прочее';
  if (/live-app-map|vite/i.test(c)) return 'визуализатор vite (+шлюз, снимки-сервис)';
  return 'прочее ' + p.name;
};
const browser = await chromium.launch({ executablePath: HELIUM, headless: false, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1040 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const bcdp = await browser.newBrowserCDPSession();
const procs = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo;
const reqs = new Map(); let snapReq = 0;
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.includes('snapshot')) snapReq++; const k = u.host; reqs.set(k, (reqs.get(k) ?? 0) + 1); });
const os0 = osCpu(); const p0 = await procs(); const t0 = Date.now();
await page.goto(base + '/?map=/maps/' + map + '.liveappmap.json', { waitUntil: 'domcontentloaded' });
if (process.env.UNLIMITED === '1') { await page.waitForTimeout(3000); await page.evaluate(async () => { const m = await import('/src/store/app-store.ts'); const s = m.useAppStore.getState(); s.setMaxLiveIframes(9999); s.setMaxWarmIframes(9999); }); }
if (process.env.ZOOM_OUT === '1') { await page.waitForTimeout(4000); await page.mouse.move(960, 520); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(120); } }
const timeline = [];
let prev = await procs(); let prevT = Date.now();
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(2000);
  const cur = await procs(); const now = Date.now();
  const byType = {};
  for (const p of cur) { const d = p.cpuTime - (prev.find((q) => q.id === p.id)?.cpuTime ?? 0); byType[p.type] = +((byType[p.type] ?? 0) + d).toFixed(2); }
  const st = await page.evaluate(() => ({ iframes: document.querySelectorAll('iframe').length, snaps: document.querySelectorAll('[data-lam-snapshot]').length, nodes: document.querySelectorAll('.react-flow__node').length })).catch(() => ({}));
  timeline.push({ t: Math.round((now - t0) / 1000), coresBrowser: +(Object.values(byType).reduce((a, b) => a + b, 0) / ((now - prevT) / 1000)).toFixed(2), byType, ...st });
  prev = cur; prevT = now;
}
const os1 = osCpu(); const p1 = await procs(); const wall = (Date.now() - t0) / 1000;
const groups = {};
for (const p of os1) { const before = os0.find((q) => q.id === p.id)?.cpu ?? 0; const g = group(p); groups[g] = +((groups[g] ?? 0) + (p.cpu - before)).toFixed(1); }
const renderers = p1.filter((p) => p.type === 'renderer').length;
const browserCpu = p1.reduce((a, p) => a + p.cpuTime - (p0.find((q) => q.id === p.id)?.cpuTime ?? 0), 0);
const cores = Number(execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object NumberOfLogicalProcessors -Sum).Sum"').toString().trim());
console.log(JSON.stringify({ map, wallSec: Math.round(wall), logicalCores: cores, renderers, browserCpuSec: +browserCpu.toFixed(1), osCpuSecByGroup: groups, snapshotRequests: snapReq, requestsByHost: Object.fromEntries([...reqs].sort((a, b) => b[1] - a[1]).slice(0, 12)), timeline }, null, 1));
await browser.close();
