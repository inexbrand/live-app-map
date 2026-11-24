/**
 * Рецепты свежего скана: какая команда, где и куда пишет для каждой карты каталога.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { monorepoScanRecipes } from './map-scan-recipes';

describe('monorepoScanRecipes', () => {
  const tmp = '/tmp/scan';

  test('карта проекта: cli scan --project в монорепо, вывод во временный каталог', () => {
    const output = path.join(tmp, 'map.json');
    expect(monorepoScanRecipes('/repo', { name: 'korbor', root: '/k' })('korbor', tmp)).toEqual({
      command: 'bun',
      args: ['packages/cli/src/bin.ts', 'scan', '--project', '/k', '-o', output],
      cwd: '/repo',
      env: {},
      output,
    });
    expect(monorepoScanRecipes('/repo', null)('korbor', tmp)).toBeNull();
  });

  test('live-app-map — cli code по монорепо; чужая карта — рецепта нет', () => {
    const recipes = monorepoScanRecipes('/repo', null);
    const output = path.join(tmp, 'live-app-map.liveappmap.json');
    expect(recipes('live-app-map', tmp)).toEqual({
      command: 'bun',
      args: ['packages/cli/src/bin.ts', 'code', '--dir', '/repo', '--format', 'liveappmap', '-o', output],
      cwd: '/repo',
      env: {},
      output,
    });
    expect(recipes('other', tmp)).toBeNull();
  });
});
