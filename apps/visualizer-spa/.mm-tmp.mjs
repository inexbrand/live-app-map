import { chromium } from '@playwright/test';
const out = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const vp = () => p.evaluate(() => document.querySelector('.react-flow__viewport')?.style.transform);
for (const m of ['korbor-all', 'korbor-miniapp']) {
  await p.goto(`http://localhost:4310/?map=/maps/${m}.liveappmap.json`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(8000);
  const info = await p.evaluate(() => { const mm = document.querySelector('.react-flow__minimap'); const svg = mm?.querySelector('svg'); const r = mm?.getBoundingClientRect(); const sr = svg?.getBoundingClientRect();
    const nodes = [...(svg?.querySelectorAll('.react-flow__minimap-node') ?? [])]; const vis = nodes.filter(n => { const b = n.getBoundingClientRect(); return b.width > 0.5 && b.height > 0.5 && b.right > sr.left && b.left < sr.right && b.top < sr.bottom && b.bottom > sr.top; }).length;
    const mask = svg?.querySelector('.react-flow__minimap-mask'); return { box: r && [r.x|0, r.y|0, r.width|0, r.height|0], svg: sr && [sr.width|0, sr.height|0], attr: svg && [svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')], nodes: nodes.length, visibleNodes: vis, maskPath: mask?.getAttribute('d')?.slice(0, 80), vw: innerWidth, vh: innerHeight }; });
  console.log(m, JSON.stringify(info));
  const before = await vp(); const [x, y, w, h] = info.box;
  await p.mouse.click(x + w * 0.2, y + h * 0.8); await p.waitForTimeout(800); const afterClick = await vp();
  await p.mouse.move(x + w / 2, y + h / 2); await p.mouse.down(); await p.mouse.move(x + w / 2 - 30, y + h / 2 - 20, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(800); const afterDrag = await vp();
  await p.mouse.move(x + w / 2, y + h / 2); await p.mouse.wheel(0, -300); await p.waitForTimeout(800); const afterWheel = await vp();
  console.log(' viewport', { before, afterClick, afterDrag, afterWheel });
  await p.screenshot({ path: `${out}/mm-${m}.png`, clip: { x: Math.max(0, x - 60), y: Math.max(0, y - 60), width: Math.min(400, 1600 - x + 60), height: Math.min(260, 1000 - y + 60) } });
}
await b.close();
