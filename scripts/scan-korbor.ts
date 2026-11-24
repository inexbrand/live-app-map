#!/usr/bin/env bun
/**
 * Карта korbor: тонкая обёртка над `live-app-map scan --project <korbor>`.
 * Конфиг — `<korbor>/.live-app-map/config.ts`, карта — `<korbor>/.live-app-map/map.json`.
 * Репозиторий korbor — KORBOR_DIR, иначе соседний ../korbor.
 */
import path from 'node:path';
import { runCli } from '../packages/cli/src/commands';

/**
 * Каталог korbor из окружения или рядом с репозиторием live-app-map.
 *
 * @param env - переменные окружения
 * @param scriptDir - каталог скрипта
 * @returns абсолютный путь korbor
 */
export function korborDir(env: Readonly<Record<string, string | undefined>>, scriptDir: string): string {
  return path.resolve(env['KORBOR_DIR'] ?? path.join(scriptDir, '../../korbor'));
}

if (import.meta.main) {
  const code = await runCli(['scan', '--project', korborDir(process.env, import.meta.dir)], {
    log: (text) => console.log(text),
    error: (text) => console.error(text),
    cwd: process.cwd(),
    now: () => new Date(),
  });
  process.exit(code);
}
