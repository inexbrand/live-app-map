/**
 * Мини-карта: SVG целиком в своём контейнере, все ноды в границах и
 * занимают его (а не узкую полосу), рамка вьюпорта точна при любом зуме,
 * клик центрирует холст в точке клика, перетаскивание и колесо пропорциональны.
 */
import { expect, test, type Page } from '@playwright/test';
import { WIDE_VIEWPORT, PROJECT_MAP } from './helpers';
import { inside, matrixOf, minimapRaw, viewBoxOf, type Rect } from './probes';

/** Снимок состояния мини-карты и холста в координатах экрана. */
type MiniState = {
  readonly box: Rect;
  readonly svg: Rect;
  readonly viewBox: Rect;
  readonly nodes: readonly Rect[];
  readonly pageFills: readonly string[];
  readonly frameFills: readonly string[];
  readonly flow: Rect;
  readonly tx: number;
  readonly ty: number;
  readonly zoom: number;
};

async function readState(page: Page): Promise<MiniState> {
  const raw = await page.evaluate(minimapRaw);
  return {
    box: raw.box,
    svg: raw.svg,
    viewBox: viewBoxOf(raw.viewBox),
    nodes: raw.nodes.map((n) => n.rect),
    pageFills: raw.nodes.filter((n) => !n.frame).map((n) => n.fill),
    frameFills: raw.nodes.filter((n) => n.frame).map((n) => n.fill),
    flow: raw.flow,
    ...matrixOf(raw.transform),
  };
}

/** Масштаб и сдвиг SVG (preserveAspectRatio xMidYMid meet): экран → поток и обратно. */
function svgMapping(s: MiniState) {
  const k = Math.min(s.svg.w / s.viewBox.w, s.svg.h / s.viewBox.h);
  const ox = s.svg.x + (s.svg.w - s.viewBox.w * k) / 2;
  const oy = s.svg.y + (s.svg.h - s.viewBox.h * k) / 2;
  return {
    k,
    toFlow: (px: number, py: number) => ({ x: s.viewBox.x + (px - ox) / k, y: s.viewBox.y + (py - oy) / k }),
    toScreen: (fx: number, fy: number) => ({ x: ox + (fx - s.viewBox.x) * k, y: oy + (fy - s.viewBox.y) * k }),
  };
}

/** Рамка вьюпорта (видимая часть холста) на экране, в px мини-карты. */
function viewportFrame(s: MiniState): Rect {
  const map = svgMapping(s);
  const a = map.toScreen(-s.tx / s.zoom, -s.ty / s.zoom);
  const b = map.toScreen((s.flow.w - s.tx) / s.zoom, (s.flow.h - s.ty) / s.zoom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Точка потока в центре холста. */
function canvasCenter(s: MiniState) {
  return { x: (s.flow.w / 2 - s.tx) / s.zoom, y: (s.flow.h / 2 - s.ty) / s.zoom };
}

async function open(page: Page, map: string): Promise<MiniState> {
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto(`/?map=${map}`);
  await expect(page.locator('.react-flow__minimap-node').first()).toBeAttached({ timeout: 30_000 });
  return readState(page);
}

for (const map of [PROJECT_MAP]) {
  test(`${map}: SVG и ноды целиком в контейнере мини-карты, ноды занимают её`, async ({ page }) => {
    const s = await open(page, map);
    expect(inside(s.svg, s.box)).toBe(true);
    expect(Math.abs(s.svg.w - s.box.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(s.svg.h - s.box.h)).toBeLessThanOrEqual(2);
    const outside = s.nodes.filter((n) => !inside(n, s.box));
    expect(outside).toEqual([]);
    // Ноды — не узкая полоса: охват по большей стороне раскладки почти весь контейнер.
    const left = Math.min(...s.nodes.map((n) => n.x));
    const right = Math.max(...s.nodes.map((n) => n.x + n.w));
    const top = Math.min(...s.nodes.map((n) => n.y));
    const bottom = Math.max(...s.nodes.map((n) => n.y + n.h));
    expect(Math.max((right - left) / s.box.w, (bottom - top) / s.box.h)).toBeGreaterThan(0.8);
    // Рамки групп — контуром, экраны — заливкой цвета группы.
    expect(s.frameFills.length).toBeGreaterThan(0);
    expect(new Set(s.frameFills)).toEqual(new Set(['none']));
    expect(s.pageFills.every((f) => f !== 'none')).toBe(true);
  });
}

test('клик по мини-карте центрирует холст в точке клика', async ({ page }) => {
  const s = await open(page, PROJECT_MAP);
  const map = svgMapping(s);
  // Точка в правой нижней части нод — далеко от текущего центра.
  const target = s.nodes.reduce((a, n) => (n.x + n.y > a.x + a.y ? n : a));
  const px = target.x + target.w / 2;
  const py = target.y + target.h / 2;
  const want = map.toFlow(px, py);
  await page.mouse.click(px, py);
  await expect
    .poll(async () => {
      const c = canvasCenter(await readState(page));
      return Math.hypot(c.x - want.x, c.y - want.y) * map.k;
    }, { timeout: 5_000 })
    .toBeLessThan(2);
});

test('перетаскивание по мини-карте сдвигает рамку вьюпорта ровно за курсором', async ({ page }) => {
  const s = await open(page, PROJECT_MAP);
  const before = viewportFrame(s);
  const sx = before.x + Math.min(before.w, 20) / 2;
  const sy = before.y + Math.min(before.h, 20) / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 30, sy + 25, { steps: 6 });
  await page.mouse.up();
  const after = viewportFrame(await readState(page));
  expect(Math.abs(after.x - before.x - 30)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y - 25)).toBeLessThan(2);
});

test('колесо по мини-карте меняет зум, рамка вьюпорта всегда внутри контейнера', async ({ page }) => {
  const s = await open(page, PROJECT_MAP);
  expect(inside(viewportFrame(s), s.box)).toBe(true);
  await page.mouse.move(s.box.x + s.box.w / 2, s.box.y + s.box.h / 2);
  let zoom = s.zoom;
  for (const dy of [300, 300, 300, -200]) {
    await page.mouse.wheel(0, dy);
    const next = await expect.poll(async () => (await readState(page)).zoom, { timeout: 3_000 }).not.toBe(zoom).then(() => readState(page));
    // Колесо вниз — мельче, вверх — крупнее.
    expect(Math.sign(zoom - next.zoom)).toBe(Math.sign(dy));
    zoom = next.zoom;
    const st = await readState(page);
    expect(inside(st.svg, st.box)).toBe(true);
    expect(inside(viewportFrame(st), st.box)).toBe(true);
  }
});
