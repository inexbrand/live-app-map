/**
 * Рецепты свежего скана карт каталога: карта проекта — `cli scan --project`,
 * live-app-map — `cli code` по самому монорепо. Вывод — во временный каталог,
 * карты на диске не меняются.
 */
import path from 'node:path';
import type { ScanRecipes } from './map-versions';

/** Проект для рецепта: id карты (config.name) и корень. */
export type RecipeProject = { readonly name: string; readonly root: string };

/**
 * Рецепты для монорепо live-app-map.
 *
 * @param monorepo - корень монорепо (там packages/)
 * @param project - открытый проект или null
 * @returns функция рецепта по id карты
 */
export function monorepoScanRecipes(monorepo: string, project: RecipeProject | null): ScanRecipes {
  return (mapId, tmp) => {
    if (project !== null && mapId === project.name) {
      const output = path.join(tmp, 'map.json');
      return {
        command: 'bun',
        args: ['packages/cli/src/bin.ts', 'scan', '--project', project.root, '-o', output],
        cwd: monorepo,
        env: {},
        output,
      };
    }
    if (mapId === 'live-app-map') {
      const output = path.join(tmp, 'live-app-map.liveappmap.json');
      return {
        command: 'bun',
        args: ['packages/cli/src/bin.ts', 'code', '--dir', monorepo, '--format', 'liveappmap', '-o', output],
        cwd: monorepo,
        env: {},
        output,
      };
    }
    return null;
  };
}
