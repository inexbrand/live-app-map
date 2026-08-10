/**
 * Ядро сканера: walk, ignore, example params, сборка документа.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import type {
  AppMapDocument,
  AppMapEdge,
  AppMapNode,
  Diagnostic,
  FrameworkKind,
} from '@live-app-map/schema';
import { FORMAT_VERSION } from '@live-app-map/schema';

/** Реэкспорт framework kind для CLI / defineConfig. */
export type { FrameworkKind };

/** Значение example-параметра: скаляр или сегменты catch-all. */
export type ParamExampleValue = string | readonly string[];

/** Переопределения example-параметров по pathPattern. */
export type ExampleParamsByRoute = Readonly<
  Record<string, Readonly<Record<string, ParamExampleValue>>>
>;

/**
 * Примеры dynamic params для materialize.
 * Именованные ключи — имена параметров; `byRoute` — override per pathPattern.
 */
export type ExampleParamsConfig = {
  readonly byRoute?: ExampleParamsByRoute;
  readonly [paramName: string]:
    | ParamExampleValue
    | ExampleParamsByRoute
    | undefined;
};

/**
 * Читает example-значение параметра (byRoute → top-level; byRoute-ключ игнорируется).
 */
export function getExampleParam(
  exampleParams: ExampleParamsConfig,
  name: string,
  byRoute?: Readonly<Record<string, ParamExampleValue>>,
): ParamExampleValue | undefined {
  const fromRoute = byRoute?.[name];
  if (fromRoute !== undefined) {
    return fromRoute;
  }
  if (name === 'byRoute') {
    return undefined;
  }
  const v = exampleParams[name];
  if (typeof v === 'string' || Array.isArray(v)) {
    return v;
  }
  return undefined;
}

export type ScanRequest = {
  readonly projectRoot: string;
  readonly appRoot?: string;
  readonly framework?: FrameworkKind | 'auto';
  readonly baseUrl?: string | null;
  readonly exampleParams?: ExampleParamsConfig;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly includeRouteHandlers?: boolean;
  readonly mode?: 'full' | 'incremental';
};

export type ScanResult = {
  readonly document: AppMapDocument;
  readonly diagnostics: readonly Diagnostic[];
  readonly timing: {
    readonly discoverMs: number;
    readonly edgesMs: number;
    readonly totalMs: number;
  };
};

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

const DEFAULT_EXCLUDE = [
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

/**
 * Подставляет example-params в path pattern (dynamic / catch-all / optional catch-all).
 */
export function materializePath(
  pattern: string,
  exampleParams: ExampleParamsConfig = {},
): { path: string; missing: string[] } {
  const byRoute = exampleParams.byRoute?.[pattern];
  const missing: string[] = [];
  let result = pattern;

  // optional catch-all [[...param]] — empty/undefined → no segment
  result = result.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      return '';
    }
    if (Array.isArray(v)) {
      return v.length ? v.join('/') : '';
    }
    return String(v);
  });

  // catch-all [...param]
  result = result.replace(/\[\.\.\.([^\]]+)\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      missing.push(name);
      return 'example';
    }
    if (Array.isArray(v)) {
      return v.join('/');
    }
    return String(v);
  });

  // dynamic [param]
  result = result.replace(/\[([^\].]+)\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      missing.push(name);
      return 'example';
    }
    if (Array.isArray(v)) {
      return v[0] ?? 'example';
    }
    return String(v);
  });

  // collapse double slashes and trailing
  result = result.replace(/\/{2,}/g, '/');
  if (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  if (result === '') {
    result = '/';
  }
  return { path: result, missing };
}

/**
 * Извлекает имена dynamic-параметров из path pattern.
 */
export function extractDynamicParams(pattern: string): string[] {
  const names: string[] = [];
  const re = /\[(?:\.\.\.)?([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    const name = m[1];
    if (name) {
      names.push(name.replace(/^\.\.\./, ''));
    }
  }
  return names;
}

/**
 * Человекочитаемый заголовок маршрута для UI карты (общий для next / react-router).
 *
 * @param pattern pathPattern вида `/`, `/users/[id]`, `/shop/[...slug]`
 * @returns «Главная» для корня, иначе сегменты через ` / ` без скобок dynamic
 */
export function humanTitle(pattern: string): string {
  if (pattern === '/' || pattern === '') {
    return 'Главная';
  }
  return pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const stripped = seg.replace(/^\[+\.?\.?\.?/, '').replace(/\]+$/, '');
      return stripped || seg;
    })
    .join(' / ');
}

/**
 * Стабильный короткий content-hash (sha256, 16 hex) для revision документа.
 */
export function contentRevision(parts: readonly string[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    h.update(p);
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * Сборка AppMapDocument из нод/рёбер.
 */
export function assembleDocument(input: {
  readonly projectRoot: string;
  readonly projectName?: string;
  readonly framework: FrameworkKind;
  readonly baseUrl?: string | null;
  readonly nodes: readonly AppMapNode[];
  readonly edges: readonly AppMapEdge[];
  readonly generatorName?: string;
  readonly next?: AppMapDocument['project']['next'];
  readonly groups?: AppMapDocument['groups'];
}): AppMapDocument {
  const revision = contentRevision([
    ...input.nodes.map((n) => `${n.id}|${n.pathPattern}|${n.url ?? ''}`),
    ...input.edges.map((e) => e.id),
  ]);
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'live-app-map',
    generatedAt: new Date().toISOString(),
    generator: {
      name: input.generatorName ?? '@live-app-map/scanner-core',
      version: '0.1.0',
    },
    revision,
    project: {
      name: input.projectName,
      root: input.projectRoot,
      framework: input.framework,
      next: input.next,
    },
    baseUrl: input.baseUrl ?? null,
    nodes: input.nodes,
    edges: input.edges,
    groups: input.groups,
    layout: {
      algorithm: 'dagre',
      direction: 'LR',
    },
  };
}

/**
 * Детект framework в каталоге (next / hybrid / react-router / unknown).
 */
export function detectFramework(absRoot: string): FrameworkKind {
  const hasApp =
    existsSync(path.join(absRoot, 'app')) ||
    existsSync(path.join(absRoot, 'src', 'app'));
  const hasPages =
    existsSync(path.join(absRoot, 'pages')) ||
    existsSync(path.join(absRoot, 'src', 'pages'));
  const hasNextConfig =
    existsSync(path.join(absRoot, 'next.config.js')) ||
    existsSync(path.join(absRoot, 'next.config.mjs')) ||
    existsSync(path.join(absRoot, 'next.config.ts'));
  const pkgPath = path.join(absRoot, 'package.json');
  let deps = '';
  if (existsSync(pkgPath)) {
    try {
      deps = JSON.stringify(JSON.parse(readFileSync(pkgPath, 'utf8')) as unknown);
    } catch {
      // битый package.json — не считаем deps, detekt по layout
      deps = '';
    }
  }
  const hasRR =
    deps.includes('react-router') ||
    existsSync(path.join(absRoot, 'src', 'app', 'router.tsx')) ||
    existsSync(path.join(absRoot, 'src', 'app', 'routes-config.tsx'));

  if ((hasApp || hasPages) && hasNextConfig) {
    if (hasApp && hasPages) {
      return 'hybrid';
    }
    return 'next';
  }
  if (hasApp && !hasRR) {
    return 'next';
  }
  if (hasRR) {
    return 'react-router';
  }
  if (hasApp || hasPages) {
    return 'next';
  }
  return 'unknown';
}

export { diag, DEFAULT_EXCLUDE };
