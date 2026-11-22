/**
 * Сервисы — каталоги с package.json; файл принадлежит ближайшему.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CodeService } from '@live-app-map/schema';

/** Сервисы и функция «файл → сервис». */
export type ServiceIndex = {
  readonly all: readonly CodeService[];
  readonly serviceOf: (relFile: string) => CodeService;
};

/**
 * Имя пакета из package.json; без поля name — путь каталога.
 *
 * @param absRoot - корень скана
 * @param dir - каталог пакета относительно корня
 * @returns имя
 */
function packageName(absRoot: string, dir: string): string {
  const raw: unknown = JSON.parse(readFileSync(path.join(absRoot, dir, 'package.json'), 'utf8'));
  if (raw !== null && typeof raw === 'object' && 'name' in raw && typeof raw.name === 'string' && raw.name !== '') {
    return raw.name;
  }
  return dir === '' ? path.basename(absRoot) : dir;
}

/** Каталоги с package.json (корень — '', есть всегда). */
function serviceDirs(relFiles: readonly string[]): string[] {
  const dirs = relFiles
    .filter((f) => f === 'package.json' || f.endsWith('/package.json'))
    .map((f) => (f === 'package.json' ? '' : f.slice(0, -'/package.json'.length)));
  return dirs.includes('') ? dirs : [...dirs, ''];
}

/**
 * Строит индекс сервисов по списку файлов корня.
 *
 * @param absRoot - корень скана
 * @param relFiles - все файлы корня (POSIX, относительные)
 * @returns индекс
 */
export function indexServices(absRoot: string, relFiles: readonly string[]): ServiceIndex {
  const services = new Map<string, CodeService>();
  for (const dir of serviceDirs(relFiles)) {
    const name = dir === '' && !relFiles.includes('package.json') ? path.basename(absRoot) : packageName(absRoot, dir);
    services.set(dir, { id: `service:${name}`, name, root: dir === '' ? '.' : dir });
  }
  const byDepth = [...services.keys()].sort((a, b) => b.length - a.length);
  const serviceOf = (relFile: string): CodeService => {
    const dir = byDepth.find((d) => d === '' || relFile.startsWith(`${d}/`)) ?? '';
    const found = services.get(dir);
    if (found === undefined) {
      throw new Error(`нет сервиса для ${relFile}`);
    }
    return found;
  };
  return { all: [...services.values()], serviceOf };
}