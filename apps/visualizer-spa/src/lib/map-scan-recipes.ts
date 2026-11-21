/**
 * Рецепты свежего скана карт каталога: korbor-* — `scripts/scan-korbor.ts` (пишет все
 * поверхности сразу), live-app-map — `cli code` по самому монорепо. Вывод — во
 * временный каталог, карты репозитория не меняются.
 */
import path from 'node:path';
import type { ScanRecipes } from './map-versions';

const KORBOR_MAPS = new Set(['korbor-miniapp', 'korbor-admin', 'korbor-site', 'korbor-all']);

/**
 * Рецепты для монорепо live-app-map.
 *
 * @param monorepo - корень монорепо (там scripts/ и packages/)
 * @param env - окружение dev-сервера (KORBOR_DIR)
 * @returns функция рецепта по id карты
 */
export function monorepoScanRecipes(monorepo: string, env: Readonly<Record<string, string | undefined>>): ScanRecipes {
  return (mapId, tmp) => {
    if (KORBOR_MAPS.has(mapId)) {
      const korbor = env['KORBOR_DIR'];
      return {
        command: 'bun',
        args: ['scripts/scan-korbor.ts'],
        cwd: monorepo,
        env: {
          ...(korbor === undefined ? {} : { KORBOR_DIR: korbor }),
          LAM_MAPS_OUT: path.join(tmp, 'maps'),
          LAM_PUBLIC_MAPS_OUT: path.join(tmp, 'public'),
        },
        output: path.join(tmp, 'public', `${mapId}.liveappmap.json`),
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
