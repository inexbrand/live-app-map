/**
 * Scanner host: walk, ignore, example params, document assembly.
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

export type ExampleParamsConfig = {
  readonly [paramName: string]: string | readonly string[];
} & {
  readonly byRoute?: Readonly<Record<string, Readonly<Record<string, string | readonly string[]>>>>;
};

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
 * Проверяет, исключён ли путь.
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
 */
export function walkFiles(
  absRoot: string,
  exclude: readonly string[] = DEFAULT_EXCLUDE,
): string[] {
  const out: string[] = [];
  function walk(abs: string, rel: string): void {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
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
      } catch {
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
 * Materialize path pattern with example params.
 */
export function materializePath(
  pattern: string,
  exampleParams: ExampleParamsConfig = {},
): { path: string; missing: string[] } {
  const byRoute = exampleParams.byRoute?.[pattern];
  const missing: string[] = [];
  let result = pattern;

  // optional catch-all [[...param]] — empty array → no segment (root-friendly)
  result = result.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_m, name: string) => {
    const v = byRoute?.[name] ?? exampleParams[name];
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
    const v = byRoute?.[name] ?? exampleParams[name];
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
    const v = byRoute?.[name] ?? exampleParams[name];
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
 * Extract dynamic param names from pattern.
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
 * Content hash for revision.
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
 * Детект framework в каталоге.
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
