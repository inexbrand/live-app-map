/**
 * Запуск замеров Reassure под bun test. CLI reassure зовёт `node <TEST_RUNNER_PATH> <аргументы jest>`
 * и передаёт REASSURE_OUTPUT_FILE; аргументы jest здесь не нужны — bun получает файлы
 * *.perf-test.tsx из src. Условие require: ESM-обёртка pretty-format под bun теряет plugins.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = readdirSync(path.join(app, 'src'), { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.perf-test.tsx'))
  .map((f) => `./src/${f}`);
if (files.length === 0) {
  console.error('нет файлов *.perf-test.tsx в src');
  process.exit(1);
}
const run = spawnSync('bun', ['test', '--conditions=require', ...files], { cwd: app, stdio: 'inherit', env: process.env });
process.exit(run.status ?? 1);
