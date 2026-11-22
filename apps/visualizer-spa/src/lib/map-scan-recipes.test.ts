/**
 * Рецепты свежего скана: какая команда, где и куда пишет для каждой карты каталога.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { monorepoScanRecipes } from './map-scan-recipes';

describe('monorepoScanRecipes', () => {
  const tmp = '/tmp/scan';

  test('korbor-*: scan-korbor.ts в монорепо, вывод во временный каталог, KORBOR_DIR из окружения', () => {
    const recipe = monorepoScanRecipes('/repo', { KORBOR_DIR: '/k' })('korbor-admin', tmp);
    expect(recipe).toEqual({
      command: 'bun',
      args: ['scripts/scan-korbor.ts'],
      cwd: '/repo',
      env: { KORBOR_DIR: '/k', LAM_MAPS_OUT: path.join(tmp, 'maps'), LAM_PUBLIC_MAPS_OUT: path.join(tmp, 'public') },
      output: path.join(tmp, 'public', 'korbor-admin.liveappmap.json'),
    });
    expect(monorepoScanRecipes('/repo', {})('korbor-all', tmp)?.env).toEqual({ LAM_MAPS_OUT: path.join(tmp, 'maps'), LAM_PUBLIC_MAPS_OUT: path.join(tmp, 'public') });
  });

  test('live-app-map — cli code по монорепо; чужая карта — рецепта нет', () => {
    const recipes = monorepoScanRecipes('/repo', {});
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
