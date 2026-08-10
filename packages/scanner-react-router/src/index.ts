/**
 * React Router scanner: path literals из route config / createBrowserRouter.
 * Best-effort static regex (wave 2); config entries[] optional.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import {
  assembleDocument,
  extractDynamicParams,
  materializePath,
  walkFiles,
  type ExampleParamsConfig,
  type ScanRequest,
  type ScanResult,
} from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';

export type ReactRouterScanOptions = ScanRequest & {
  /** Файлы-точки входа с route objects (относительно app root) */
  readonly entries?: readonly string[];
};

const DEFAULT_ENTRY_GLOBS = [
  'src/app/routes-config.tsx',
  'src/app/routes-config.ts',
  'src/app/router.tsx',
  'src/app/router.ts',
  'src/features/shell/route-config.ts',
  'src/features/shell/route-config.tsx',
  'src/features/shell/router.ts',
  'src/features/shell/router.tsx',
  'src/router.tsx',
  'src/router.ts',
  'src/routes.tsx',
  'src/routes.ts',
];

/**
 * Извлекает path-литералы из исходника route-конфига.
 * Поддерживает: path: "feed", path: "/vacancies", path: 'deals/:id'
 */
export function extractPathsFromSource(source: string): string[] {
  const paths: string[] = [];
  const re = /\bpath\s*:\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const p = m[1];
    if (!p || p === '*' || p.includes('${')) {
      continue;
    }
    paths.push(p);
  }
  // tabRoute("id", "path") / similar helpers: second string literal
  const tabRe =
    /\b(?:tabRoute|route|childRoute)\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
  while ((m = tabRe.exec(source)) !== null) {
    const p = m[1];
    if (p && p !== '*' && !p.includes('${')) {
      paths.push(p);
    }
  }
  // index routes → treat parent later; also Navigate to=
  const navRe = /\bto=["'`]([^"'`]+)["'`]/g;
  while ((m = navRe.exec(source)) !== null) {
    const p = m[1];
    if (p && p.startsWith('/')) {
      paths.push(p);
    }
  }
  // Korbor admin: def("id", "/section", "relative/path", index)
  const defRe =
    /\bdef\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
  while ((m = defRe.exec(source)) !== null) {
    const section = m[1];
    const relPath = m[2];
    if (section && section !== '*') {
      paths.push(section);
    }
    if (relPath && relPath !== '*') {
      paths.push(relPath.startsWith('/') ? relPath : `/${relPath}`);
    }
  }
  return [...new Set(paths)];
}

/**
 * Нормализует RR path segments в absolute pattern.
 */
export function normalizeRrPath(raw: string, parent = '/'): string {
  if (raw.startsWith('/')) {
    return raw === '' ? '/' : raw.replace(/\/+/g, '/');
  }
  if (parent === '/') {
    return `/${raw}`.replace(/\/+/g, '/');
  }
  return `${parent.replace(/\/$/, '')}/${raw}`.replace(/\/+/g, '/');
}

/**
 * RR :param → [param] для единого pathPattern.
 */
export function rrToPattern(pathStr: string): string {
  return pathStr
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':') && seg.endsWith('?')) {
        return `[${seg.slice(1, -1)}]`;
      }
      if (seg.startsWith(':')) {
        return `[${seg.slice(1)}]`;
      }
      if (seg.startsWith('*')) {
        return `[...${seg.slice(1) || 'rest'}]`;
      }
      return seg;
    })
    .join('/');
}

function humanTitle(pattern: string): string {
  if (pattern === '/') {
    return 'Home';
  }
  return pattern
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/^\[/, '').replace(/\]$/, '').replace(/^\.\.\./, ''))
    .join(' / ');
}

/**
 * Скан React Router приложения.
 */
export async function scanReactRouterApp(
  request: ReactRouterScanOptions,
): Promise<ScanResult> {
  const t0 = Date.now();
  const absRoot = path.resolve(request.appRoot ?? request.projectRoot);
  const exampleParams = request.exampleParams ?? {};
  const baseUrl = request.baseUrl ?? null;
  const diagnostics: Diagnostic[] = [];

  const entryFiles: string[] = [];
  for (const e of request.entries ?? DEFAULT_ENTRY_GLOBS) {
    const abs = path.join(absRoot, e);
    if (existsSync(abs)) {
      entryFiles.push(e.replace(/\\/g, '/'));
    }
  }

  // Also scan shell nav for admin-style path catalogs (paths relative to app root)
  const srcRoot = path.join(absRoot, 'src');
  const extraCandidates = walkFiles(srcRoot).filter(
    (f) =>
      /(route-config|routes-config|router|nav)\.(ts|tsx)$/.test(f) ||
      f.endsWith('/nav.ts') ||
      f.endsWith('/nav.tsx'),
  );
  for (const f of extraCandidates) {
    const posix = `src/${f.replace(/\\/g, '/')}`.replace(/\/+/g, '/');
    if (!entryFiles.includes(posix) && !posix.includes('__tests__')) {
      entryFiles.push(posix);
    }
  }

  // def("id", "/section", "path/pattern", …) — Korbor admin route-config
  // handled via extractPathsFromSource enhancements below when files are read

  if (entryFiles.length === 0) {
    diagnostics.push(
      diag('NO_ROUTES_FOUND', {
        message: 'Не найдены route config entry files',
        file: absRoot,
      }),
    );
  }

  const rawPaths = new Set<string>();
  const pathSources = new Map<string, string>();

  for (const rel of entryFiles) {
    const abs = path.join(absRoot, rel);
    let source: string;
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const p of extractPathsFromSource(source)) {
      const absPath = normalizeRrPath(p);
      rawPaths.add(absPath);
      pathSources.set(absPath, rel);
    }
  }

  // Always include root
  rawPaths.add('/');

  const nodes: AppMapNode[] = [];
  for (const raw of [...rawPaths].sort()) {
    if (raw === '*') {
      continue;
    }
    const pattern = rrToPattern(raw);
    const { path: pathExample, missing } = materializePath(
      pattern,
      mergeRrParams(exampleParams),
    );
    for (const p of missing) {
      diagnostics.push(
        diag('MISSING_EXAMPLE_PARAM', {
          message: `Нет example для ${p} в ${pattern}`,
          path: pattern,
        }),
      );
    }
    const url =
      baseUrl !== null
        ? (() => {
            try {
              return new URL(pathExample, baseUrl).href;
            } catch {
              return undefined;
            }
          })()
        : undefined;

    const id = `route:${pattern}`;
    nodes.push({
      id,
      kind: 'page',
      title: humanTitle(pattern),
      pathPattern: pattern,
      pathExample,
      url,
      source: pathSources.get(raw) ? { file: pathSources.get(raw) as string } : undefined,
      dynamicParams: extractDynamicParams(pattern),
      iframePolicy: { enabled: true },
      metadata: { router: 'react-router', rrPath: raw },
    });
  }

  // edges from nav order + Link/Navigate in entries
  const edges: AppMapEdge[] = [];
  const routeIndex = new Map(nodes.map((n) => [n.pathPattern, n.id]));
  for (const rel of entryFiles) {
    const abs = path.join(absRoot, rel);
    let source: string;
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const linkRe =
      /(?:to|href|path)\s*[:=]\s*["'`](\/[^"'`*]+)["'`]/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    let prev: string | null = 'route:/';
    while ((m = linkRe.exec(source)) !== null) {
      const href = (m[1] ?? '').split('?')[0] ?? '';
      const pattern = rrToPattern(href);
      const toId = routeIndex.get(pattern) ?? null;
      if (!toId || !prev) {
        continue;
      }
      const edgeId = `edge:${prev}->${toId}`;
      if (seen.has(edgeId)) {
        continue;
      }
      seen.add(edgeId);
      edges.push({
        id: edgeId,
        from: prev,
        to: toId,
        kind: 'link',
        confidence: 'medium',
        label: pattern,
        source: { file: rel, line: 1, column: m.index },
      });
      prev = toId;
    }
  }

  const document = assembleDocument({
    projectRoot: absRoot,
    projectName: path.basename(absRoot),
    framework: 'react-router',
    baseUrl,
    nodes,
    edges,
    generatorName: '@live-app-map/scanner-react-router',
  });

  const t1 = Date.now();
  if (nodes.length <= 1 && rawPaths.size <= 1) {
    diagnostics.push(diag('NO_ROUTES_FOUND', { file: absRoot }));
  } else {
    diagnostics.push(
      diag('SCAN_OK', {
        message: `RR: ${nodes.length} routes, ${edges.length} edges`,
      }),
    );
  }

  return {
    document,
    diagnostics,
    timing: {
      discoverMs: t1 - t0,
      edgesMs: 0,
      totalMs: t1 - t0,
    },
  };
}

function mergeRrParams(exampleParams: ExampleParamsConfig): ExampleParamsConfig {
  // map common RR names
  return {
    id: 'demo',
    dealId: 'demo-deal',
    candidateId: 'demo-candidate',
    step: 'profile',
    code: 'terms',
    ...exampleParams,
  };
}
