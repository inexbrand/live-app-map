/**
 * Где Live App Map хранит файлы обмена с агентом (.lam-feedback).
 *
 * Визуализатор (vite, cwd = apps/visualizer-spa), stdio MCP (cwd = корень)
 * и CLI должны видеть одну и ту же папку, поэтому она привязана к корню
 * монорепо, а не к текущему каталогу процесса.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Переменная окружения, явно задающая папку обмена. */
export const LAM_DIR_ENV = 'LAM_FEEDBACK_DIR';

/** Имя папки обмена внутри корня монорепо. */
export const LAM_DIR_NAME = '.lam-feedback';

function isWorkspaceRoot(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    const pkg: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg === 'object' && pkg !== null && 'workspaces' in pkg;
  } catch {
    return false;
  }
}

/**
 * Папка обмена: `$LAM_FEEDBACK_DIR`, иначе `<корень монорепо>/.lam-feedback`,
 * иначе `<start>/.lam-feedback`.
 *
 * @param start - каталог, от которого искать корень (обычно cwd)
 * @param envValue - значение LAM_FEEDBACK_DIR (по умолчанию из окружения)
 * @returns абсолютный путь папки (может ещё не существовать)
 */
export function resolveLamDir(
  start: string,
  envValue: string | undefined = process.env[LAM_DIR_ENV],
): string {
  if (envValue !== undefined && envValue.trim() !== '') {
    return path.resolve(envValue.trim());
  }
  let dir = path.resolve(start);
  for (;;) {
    if (isWorkspaceRoot(dir)) {
      return path.join(dir, LAM_DIR_NAME);
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.join(path.resolve(start), LAM_DIR_NAME);
    }
    dir = parent;
  }
}
