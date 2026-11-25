/**
 * Вид «Сравнение» на настоящей карте проекта (korbor): копия без роута против свежего
 * скана (настоящий scan --project через dev-сервер) и изменённая копия карты
 * с компьютера против открытой карты — с переходом к роуту.
 * Скриншоты пишутся в LAM_SHOTS_DIR, если задана.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openMap, pickOption, shot, PROJECT_MAP, PROJECT_MAP_ID, projectMapFile } from './helpers';

/**
 * Свой временный каталог для копии карты. Не test-results: параллельный запуск playwright
 * в том же пакете очищает test-results в начале и стирал бы файл до выбора.
 */
function scratchFile(name: string): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'lam-compare-')), name);
}
async function openCompare(page: Page): Promise<void> {
  await openMap(page, PROJECT_MAP, {
    ready: (p) => expect(p.getByTestId('map-select')).toHaveAttribute('data-value', PROJECT_MAP_ID, { timeout: 30_000 }),
  });
  await page.getByTestId('view-compare').click();
  await expect(page.getByTestId('compare-view')).toBeVisible();
}

/**
 * «Файл с компьютера…» в списке стороны: пункт открывает выбор файла, отдаём ему файл.
 *
 * @param page - страница
 * @param side - testid списка: compare-left или compare-right
 * @param file - путь к файлу карты
 */
async function pickFile(page: Page, side: string, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await pickOption(page, page.getByTestId(side), 'Файл с компьютера…');
  await (await chooser).setFiles(file);
}

type LiveMap = { pages: Array<{ id: string; title: string; type?: string }>; code: { routes: Array<{ id: string; method: string; path: string }> } };

test.describe('сравнение карт', () => {
  test('копия без роута против свежего скана проекта: роут появился', async ({ page }) => {
    test.setTimeout(180_000);
    // Карта проекта не в git (map.json в .gitignore) — «было» берётся файлом.
    const map = JSON.parse(readFileSync(projectMapFile(), 'utf8')) as LiveMap;
    const route = map.code.routes[0];
    if (route === undefined) {
      throw new Error('в карте проекта нет роутов');
    }
    const file = scratchFile('project-no-route.liveappmap.json');
    writeFileSync(file, JSON.stringify({ ...map, code: { ...map.code, routes: map.code.routes.slice(1) } }));
    await openCompare(page);
    await pickFile(page, 'compare-left', file);
    await expect(page.getByTestId('compare-left')).toHaveAttribute('data-value', 'file-chosen');
    await pickOption(page, page.getByTestId('compare-right'), 'Свежий скан');
    await expect(page.getByTestId('compare-loading').filter({ hasText: 'Стало' })).toContainText('сканирую проект');
    await expect(page.getByTestId('compare-total')).toContainText('Изменений', { timeout: 150_000 });
    const routes = page.getByTestId('compare-routes').getByTestId('compare-item');
    await expect(routes.filter({ hasText: `${route.method} ${route.path}` }).first()).toBeVisible();
    await shot(page, 'compare-file-vs-scan.png');
  });

  test('изменённая копия с компьютера против открытой карты: экран, роут, переход к роуту', async ({ page }) => {
    const raw = readFileSync(projectMapFile(), 'utf8');
    const map = JSON.parse(raw) as LiveMap;
    const route = map.code.routes[0];
    const screen = map.pages.find((p) => p.type !== 'service' && p.type !== 'external');
    if (route === undefined || screen === undefined) {
      throw new Error('в карте проекта нет роутов или экранов');
    }
    // Копия «было»: без первого роута, экран под старым именем.
    const old = {
      ...map,
      pages: map.pages.map((p) => (p.id === screen.id ? { ...p, title: 'Старое имя' } : p)),
      code: { ...map.code, routes: map.code.routes.slice(1) },
    };
    const file = scratchFile('project-old.liveappmap.json');
    writeFileSync(file, JSON.stringify(old));

    await openCompare(page);
    await pickFile(page, 'compare-left', file);
    await expect(page.getByTestId('compare-left')).toHaveAttribute('data-value', 'file-chosen');
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
