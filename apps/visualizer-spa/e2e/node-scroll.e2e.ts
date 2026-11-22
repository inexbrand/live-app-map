/**
 * Прокрутка живого экрана мини-аппа в ноде (живой korbor через шлюз):
 * колесо над iframe в режиме «окно» прокручивает страницу, а не холст;
 * вне iframe — холст; Ctrl+колесо — всегда зум холста. «Целиком» — нода
 * во всю высоту страницы: внутри нечего прокручивать, контент выше нижнего
 * меню, метки «обрезано» нет. Нужны мини-апп https://vite.localhost:5175,
 * API :16000 и профиль recruiter в .lam-sessions.
 */
import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import { scrollTopOf } from './probes';
import { WIDE_VIEWPORT } from './helpers';

const NODE = 'route:/feed';
const SCROLLER = '.tab-canvas__scroll';

function transform(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__viewport') ?? document.body).transform);
}

async function liveFrame(node: Locator): Promise<Frame> {
  const iframe = node.locator('iframe');
  await expect(iframe).toBeAttached({ timeout: 30_000 });
  const frame = await (await iframe.elementHandle()).contentFrame();
  if (!frame) {
    throw new Error('iframe без документа');
  }
  await frame.waitForSelector(SCROLLER, { timeout: 30_000 });
  return frame;
}

function scrollTop(frame: Frame): Promise<number> {
  return frame.evaluate(scrollTopOf, SCROLLER);
}

async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox();
  if (!b) {
    throw new Error('нет коробки');
  }
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('колесо: над экраном в «окне» — страница, вне — холст, «целиком» — без обрезки и меню не закрывает контент', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto('/?map=/maps/korbor-miniapp.liveappmap.json');
  const node = page.locator(`[data-lam-node="${NODE}"]`);
  await node.locator('.page-node__title').click();
  const frame = await liveFrame(node);
  // «Окно»: страница длиннее окна — метка «обрезано».
  await expect(node.locator('[data-lam-cropped]')).toBeVisible({ timeout: 20_000 });

  const body = node.locator('[data-lam-preview-body]');
  const at = await center(body);
  await page.mouse.move(at.x, at.y);
  const before = await transform(page);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scrollTop(frame), { timeout: 5_000 }).toBeGreaterThan(100);
  expect(await transform(page)).toBe(before);

  // Ctrl+колесо над экраном — зум холста.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect.poll(() => transform(page), { timeout: 3_000 }).not.toBe(before);

  // Вне iframe (шапка ноды) — холст.
  const zoomed = await transform(page);
  const head = await center(node.locator('.page-node__header'));
  await page.mouse.move(head.x, head.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(() => transform(page), { timeout: 3_000 }).not.toBe(zoomed);

  // «Целиком»: окно iframe = высота страницы.
  await node.locator('[data-lam-full-height]').click();
  await expect.poll(async () => Number(await node.locator('iframe').getAttribute('height')), { timeout: 20_000 }).toBeGreaterThan(1500);
  const full = await liveFrame(node);
  await expect
    .poll(() => full.evaluate((s) => { const el = document.querySelector(s); return el === null ? -1 : el.scrollHeight - el.clientHeight; }, SCROLLER), { timeout: 20_000 })
    .toBeLessThanOrEqual(8);
  await expect(node.locator('[data-lam-cropped]')).toHaveCount(0);
  // Последний блок ленты выше нижнего меню.
  const gap = await full.evaluate((s) => {
    const sc = document.querySelector(s);
    const dock = document.querySelector('.app-shell__tabbar-dock');
    const last = sc?.lastElementChild;
    return dock && last ? dock.getBoundingClientRect().top - last.getBoundingClientRect().bottom : null;
  }, SCROLLER);
  expect(gap).not.toBeNull();
  expect(gap ?? -1).toBeGreaterThanOrEqual(0);
});
