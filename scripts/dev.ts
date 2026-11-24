#!/usr/bin/env bun
/**
 * Dev-сервер визуализатора: `bun run dev [-- --project <каталог>] [--port <порт>]`.
 * --project (или LAM_PROJECT) открывает проект: его карта в каталоге, его states.ts
 * на /__lam_project/states. Путь считается от каталога, откуда запущена команда.
 * Остальные аргументы уходят vite как есть.
 */
import path from 'node:path';

/** Разбор аргументов: проект и аргументы для vite. */
export type DevArgs = { readonly project: string | null; readonly vite: readonly string[] };

/**
 * Достаёт --project из аргументов; порт по умолчанию — 4310.
 *
 * @param argv - аргументы после имени скрипта
 * @param env - окружение (LAM_PROJECT, если --project не задан)
 * @param cwd - каталог запуска
 * @returns абсолютный путь проекта (или null) и аргументы vite
 * @throws Error — --project без значения
 */
export function parseDevArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, cwd: string): DevArgs {
  const i = argv.indexOf('--project');
  const value = i === -1 ? env['LAM_PROJECT'] : argv[i + 1];
  if (i !== -1 && (value === undefined || value.startsWith('--'))) {
    throw new Error('--project: укажите каталог проекта, например bun run dev -- --project ../korbor');
  }
  const rest = i === -1 ? [...argv] : [...argv.slice(0, i), ...argv.slice(i + 2)];
  const vite = rest.includes('--port') ? rest : ['--port', '4310', ...rest];
  return { project: value === undefined || value.trim() === '' ? null : path.resolve(cwd, value), vite };
}

if (import.meta.main) {
  const args = parseDevArgs(process.argv.slice(2), process.env, process.cwd());
  const spa = path.join(import.meta.dir, '../apps/visualizer-spa');
  const child = Bun.spawn(['bun', '--bun', 'vite', '--host', ...args.vite], {
    cwd: spa,
    env: { ...process.env, ...(args.project === null ? {} : { LAM_PROJECT: args.project }) },
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  process.exit(await child.exited);
}
