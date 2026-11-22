/**
 * Замер рендеров Reassure под bun test: у bun нет `expect.getState()` (из него Reassure
 * берёт имя теста) и `global.gc` — имя передаётся явно, сборка мусора — Bun.gc.
 */
import { test } from 'bun:test';
import { appendFile } from 'node:fs/promises';
import type { ReactElement } from 'react';
import { measureRenders } from 'reassure';

/** Опции замера: число прогонов, подготовка и сценарий взаимодействия. */
export type PerfOptions = NonNullable<Parameters<typeof measureRenders>[1]>;

/** Итог замера Reassure. */
export type PerfStats = Awaited<ReturnType<typeof measureRenders>>;

if (Reflect.get(globalThis, 'gc') === undefined) {
  Reflect.set(globalThis, 'gc', () => Bun.gc(true));
}

/**
 * Замеряет рендеры экрана и, если задан REASSURE_OUTPUT_FILE (его задаёт CLI reassure),
 * дописывает строку замера в формате Reassure.
 *
 * @param name - имя замера (как имя теста в отчёте)
 * @param ui - экран
 * @param options - опции замера
 * @returns итог замера
 */
export async function measureScreen(name: string, ui: ReactElement, options: PerfOptions): Promise<PerfStats> {
  const stats = await measureRenders(ui, { ...options, writeFile: false });
  const out = outputFile();
  if (out !== undefined) {
    await appendFile(out, `${JSON.stringify({ name, type: 'render', ...stats })}\n`);
  }
  return stats;
}

/** Файл замеров от CLI reassure; запуск без CLI — не пишется. */
function outputFile(): string | undefined {
  const out = process.env['REASSURE_OUTPUT_FILE'];
  return out === '' ? undefined : out;
}

/**
 * Тест-замер: рендер был и занял время.
 *
 * @param name - имя теста и замера
 * @param ui - экран
 * @param options - опции замера
 * @param check - проверка итога
 */
export function perfTest(name: string, ui: () => ReactElement, options: PerfOptions, check: (stats: PerfStats) => void): void {
  test(name, async () => check(await measureScreen(name, ui(), options)));
}