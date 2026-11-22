/**
 * React Router scanner: path literals из route config / createBrowserRouter.
 * Best-effort static regex (wave 2); config entries[] optional.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { assembleDocument, extractDynamicParams, humanTitle, materializePath, walkFiles, type ScanRequest, type ScanResult } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { DEFAULT_ENTRY_GLOBS, extractPathsFromSource, normalizeRrPath, rrToPattern } from './rr-paths';
import { mergeRrParams, scanTanStack } from './tanstack-scan';
export { extractPathsFromSource, normalizeRrPath, rrToPattern } from './rr-paths';

export { linkTargets, parseTanStackRoutes, tanstackToPattern, type TanStackLink, type TanStackRoute } from './tanstack';

export type ReactRouterScanOptions = ScanRequest & {
  /** Файлы-точки входа с route objects (относительно app root) */
  readonly entries?: readonly string[];
};

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

  const tanstack = scanTanStack(absRoot, exampleParams, baseUrl);
  if (tanstack !== null) {
    const t1 = Date.now();
    return {
      document: assembleDocument({ projectRoot: absRoot, projectName: path.basename(absRoot), framework: 'react-router', baseUrl, nodes: tanstack.nodes, edges: tanstack.edges, generatorName: '@live-app-map/scanner-react-router' }),
      diagnostics: [...tanstack.diagnostics, diag('SCAN_OK', { message: `TanStack Router: ${tanstack.nodes.length} routes, ${tanstack.edges.length} edges` })],
      timing: { discoverMs: t1 - t0, edgesMs: 0, totalMs: t1 - t0 },
    };
  }

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

  // Корень добавляем только если уже есть реальные path (иначе dual-scan
  // framework=unknown всегда «выигрывает» RR с 1 synthetic page).
  if (rawPaths.size > 0 && !rawPaths.has('/')) {
    rawPaths.add('/');
  }

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
