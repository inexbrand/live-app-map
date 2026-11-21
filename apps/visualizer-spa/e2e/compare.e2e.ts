/**
 * Вид «Сравнение» на настоящей карте korbor-all: коммит из истории git против
 * свежего скана (настоящий scan-korbor через dev-сервер) и изменённая копия карты
 * с компьютера против открытой карты — с переходом к роуту.
 * Скриншоты пишутся в LAM_SHOTS_DIR, если задана.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env['LAM_SHOTS_DIR'];

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, name) });
  }
}

async function openCompare(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?map=/maps/korbor-all.liveappmap.json');
  await expect(page.getByTestId('map-select')).toHaveValue('korbor-all', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.getByTestId('view-compare').click();
  await expect(page.getByTestId('compare-view')).toBeVisible();
}

type LiveMap = { pages: Array<{ id: string; title: string; type?: string }>; code: { routes: Array<{ id: string; method: string; path: string }> } };

test.describe('сравнение карт', () => {
  test('старый коммит против свежего скана: роуты с изменённым входом', async ({ page }) => {
    test.setTimeout(180_000);
    await openCompare(page);
    const left = page.getByTestId('compare-left');
    // «Было» по умолчанию — последний коммит файла карты.
    await expect(left).toHaveValue(/^git:[0-9a-f]{40}$/);
    // Коммит 1bbac9c: карта уже с разделом code, но схема входа ещё без вложенных полей.
    const before = await left.locator('option', { hasText: '1bbac9c' }).getAttribute('value');
    expect(before).toMatch(/^git:1bbac9c/);
    await left.selectOption(before ?? '');
    await page.getByTestId('compare-right').selectOption('scan');
    await expect(page.getByTestId('compare-loading').filter({ hasText: 'Стало' })).toContainText('сканирую проект');
    await expect(page.getByTestId('compare-total')).toContainText('Изменений', { timeout: 150_000 });
    const routes = page.getByTestId('compare-routes').getByTestId('compare-item');
    await expect(routes.filter({ hasText: 'вход' }).first()).toBeVisible();
    await shot(page, 'compare-commit-vs-scan.png');
  });

  test('изменённая копия с компьютера против открытой карты: экран, роут, переход к роуту', async ({ page }, info) => {
    const raw = readFileSync(path.resolve(dir, '../public/maps/korbor-all.liveappmap.json'), 'utf8');
    const map = JSON.parse(raw) as LiveMap;
    const route = map.code.routes[0];
    const screen = map.pages.find((p) => p.type !== 'service' && p.type !== 'external');
    if (route === undefined || screen === undefined) {
      throw new Error('в korbor-all нет роутов или экранов');
    }
    // Копия «было»: без первого роута, экран под старым именем.
    const old = {
      ...map,
      pages: map.pages.map((p) => (p.id === screen.id ? { ...p, title: 'Старое имя' } : p)),
      code: { ...map.code, routes: map.code.routes.slice(1) },
    };
    mkdirSync(info.outputDir, { recursive: true });
    const file = path.join(info.outputDir, 'korbor-all-old.liveappmap.json');
    writeFileSync(file, JSON.stringify(old));

    await openCompare(page);
    await page.getByTestId('compare-left').selectOption('file');
    await page.getByTestId('compare-left-file').setInputFiles(file);
    await expect(page.getByTestId('compare-left')).toHaveValue('file-chosen');
    await expect(page.getByTestId('compare-total')).toHaveText('Изменений: 2');
    await expect(page.getByTestId('compare-screens').getByTestId('compare-item')).toHaveText([new RegExp(`~${screen.title}.*название`)]);
    const added = page.getByTestId('compare-routes').getByTestId('compare-item');
    await expect(added).toHaveCount(1);
    await expect(added).toHaveAttribute('data-change', 'added');
    await shot(page, 'compare-file-vs-open.png');

    await added.getByRole('button', { name: `${route.method} ${route.path}` }).click();
    await expect(page.getByTestId('api-route-card')).toContainText(route.path);
  });
});
