/**
 * Отметка пункта 09-bugs из вида «Документация»: карта временного проекта снята
 * настоящим CLI (`code --format liveappmap`), импортирована файлом; пункт закрывается
 * с подтверждением — правится markdown на диске, готовность эпохи пересчитывается;
 * обратно открывается. Заодно: селект карт после импорта показывает файл.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const monorepo = path.resolve(dir, '../../..');
const SHOTS = process.env['LAM_SHOTS_DIR'];

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, name) });
  }
}

const EPOCH = 'docs/epoch/demo-task#20261121-120000';
const BUGS = `${EPOCH}/09-bugs.md`;

test('закрыть и открыть пункт 09-bugs: файл на диске и готовность эпохи', async ({ page }, info) => {
  const root = path.join(info.outputDir, 'project');
  mkdirSync(path.join(root, EPOCH), { recursive: true });
  writeFileSync(path.join(root, EPOCH, '00-brief.md'), '# Бриф\n\n## Цель\n\nДемо-задача для отметки пунктов.\n');
  writeFileSync(path.join(root, BUGS), '# Баги\n\n## Open\n\n- Кнопка «Сохранить» не нажимается\n\n## Closed\n\n- Старый баг\n');
  // Сервис web — нода карты (карта без нод не валидна).
  writeFileSync(path.join(root, 'package.json'), '{ "name": "demo", "private": true, "workspaces": ["apps/*"] }\n');
  mkdirSync(path.join(root, 'apps/web/src'), { recursive: true });
  writeFileSync(path.join(root, 'apps/web/package.json'), '{ "name": "@demo/web", "private": true }\n');
  writeFileSync(path.join(root, 'apps/web/src/index.ts'), 'export const x = 1;\n');
  const mapFile = path.join(info.outputDir, 'demo.liveappmap.json');
  execFileSync('bun', ['packages/cli/src/bin.ts', 'code', '--dir', root, '--format', 'liveappmap', '-o', mapFile], { cwd: monorepo });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('#lam-file-input').setInputFiles(mapFile);
  // Селект карт показывает импортированный файл, а не «Выберите карту…».
  await expect(page.getByTestId('map-select').locator('option:checked')).toHaveText('Файл: demo.liveappmap.json');

  await page.getByTestId('view-docs').click();
  await page.getByTestId('docs-epoch-row').filter({ hasText: 'demo-task' }).click();
  await expect(page.getByTestId('docs-epoch-head')).toContainText('не готово · 1');
  await page.getByRole('button', { name: 'Баги' }).click();
  const item = page.getByTestId('docs-bug-item').filter({ hasText: 'Кнопка «Сохранить»' });
  await expect(item).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('docs-bug-marks')).toContainText(`Отметка правит файл на диске: ${BUGS}`);

  // Отмена — файл не меняется.
  await item.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByTestId('docs-bug-confirm').getByRole('button', { name: 'Отмена' }).click();
  expect(readFileSync(path.join(root, BUGS), 'utf8')).toContain('## Open\n\n- Кнопка');

  await item.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByTestId('docs-bug-confirm')).toContainText(`Записать в ${BUGS}`);
  await shot(page, 'docs-bug-confirm.png');
  await page.getByTestId('docs-bug-confirm').getByRole('button', { name: 'Записать' }).click();
  await expect(page.getByTestId('docs-epoch-head')).toContainText('готово');
  await expect(page.getByTestId('docs-epoch-head')).not.toContainText('не готово');
  await expect(page.getByTestId('docs-bug-item').filter({ hasText: 'Кнопка «Сохранить»' })).toHaveAttribute('data-state', 'closed');
  expect(readFileSync(path.join(root, BUGS), 'utf8')).toBe('# Баги\n\n## Open\n\n## Closed\n\n- Старый баг\n- Кнопка «Сохранить» не нажимается\n');
  await shot(page, 'docs-bug-closed.png');

  // Обратно: открыть.
  await page.getByTestId('docs-bug-item').filter({ hasText: 'Кнопка «Сохранить»' }).getByRole('button', { name: 'Открыть' }).click();
  await page.getByTestId('docs-bug-confirm').getByRole('button', { name: 'Записать' }).click();
  await expect(page.getByTestId('docs-epoch-head')).toContainText('не готово · 1');
  expect(readFileSync(path.join(root, BUGS), 'utf8')).toContain('## Open\n\n- Кнопка «Сохранить» не нажимается');
});
