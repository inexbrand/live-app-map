/**
 * Обход файлов проекта: исключения, ошибки чтения как диагностика, стабильный порядок.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Описание ошибки FS при обходе (контракт skip reason, не silent empty catch).
 */
export type WalkFsError = {
  readonly absPath: string;
  readonly relativePath: string;
  readonly phase: 'readdir' | 'stat';
  readonly error: unknown;
  readonly reason: string;
};

/**
 * Опции walkFiles: exclude + колбэк на ошибки FS.
 */
export type WalkFilesOptions = {
  readonly exclude?: readonly string[];
  /** Вызывается при skip из-за ошибки readdir/stat (диагностика / логирование). */
  readonly onFsError?: (info: WalkFsError) => void;
};

export const DEFAULT_EXCLUDE = [
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.git',
  'build',
  '.turbo',
  '__tests__',
  '__mocks__',
];

/**
 * Нормализует аргументы walkFiles: массив exclude или объект опций.
 */
function resolveWalkOptions(
  excludeOrOptions: readonly string[] | WalkFilesOptions | undefined,
): { exclude: readonly string[]; onFsError: WalkFilesOptions['onFsError'] } {
  if (excludeOrOptions === undefined) {
    return { exclude: DEFAULT_EXCLUDE, onFsError: undefined };
  }
  if (Array.isArray(excludeOrOptions)) {
    return { exclude: excludeOrOptions, onFsError: undefined };
  }
  const opts = excludeOrOptions as WalkFilesOptions;
  return {
    exclude: opts.exclude ?? DEFAULT_EXCLUDE,
    onFsError: opts.onFsError,
  };
}

/**
 * Текст причины skip по ошибке FS (для логов / diagnostics).
 */
function formatFsSkipReason(phase: WalkFsError['phase'], error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown error';
  return phase === 'readdir'
    ? `skip: readdir failed (${msg})`
    : `skip: stat failed (${msg})`;
}

/**
 * Проверяет, исключён ли posix-путь по списку exclude (имена сегментов или globs вида star-star/name/star-star).
 */
export function isExcluded(
  relPosix: string,
  exclude: readonly string[] = DEFAULT_EXCLUDE,
): boolean {
  const parts = relPosix.split('/');
  for (const ex of exclude) {
    const clean = ex.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
    if (parts.includes(clean) || relPosix.includes(clean)) {
      return true;
    }
  }
  return false;
}

/**
 * Рекурсивный walk файлов (posix relative paths).
 * Ошибки readdir/stat не глотаются молча: вызывается `onFsError` с reason, каталог/файл пропускается.
 *
 * @param absRoot — абсолютный корень обхода
 * @param excludeOrOptions — список exclude (как раньше) или {@link WalkFilesOptions}
 */
export function walkFiles(
  absRoot: string,
  excludeOrOptions: readonly string[] | WalkFilesOptions = DEFAULT_EXCLUDE,
): string[] {
  const { exclude, onFsError } = resolveWalkOptions(excludeOrOptions);
  const out: string[] = [];

  function reportFsError(
    absPath: string,
    relativePath: string,
    phase: WalkFsError['phase'],
    error: unknown,
  ): void {
    const reason = formatFsSkipReason(phase, error);
    onFsError?.({
      absPath,
      relativePath,
      phase,
      error,
      reason,
    });
  }

  function walk(abs: string, rel: string): void {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch (error: unknown) {
      reportFsError(abs, rel, 'readdir', error);
      return;
    }
    for (const name of entries) {
      const relPosix = rel ? `${rel}/${name}` : name;
      if (isExcluded(relPosix, exclude)) {
        continue;
      }
      const full = path.join(abs, name);
      let st;
      try {
        st = statSync(full);
      } catch (error: unknown) {
        reportFsError(full, relPosix, 'stat', error);
        continue;
      }
      if (st.isDirectory()) {
        walk(full, relPosix);
      } else if (st.isFile()) {
        out.push(relPosix);
      }
    }
  }
  if (existsSync(absRoot)) {
    walk(absRoot, '');
  }
  return out.sort();
}
