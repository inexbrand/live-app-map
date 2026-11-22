/**
 * React Router scanner: path literals из route config / createBrowserRouter.
 * Best-effort static regex (wave 2); config entries[] optional.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { assembleDocument, extractDynamicParams, humanTitle, materializePath, walkFiles, type ExampleParamsConfig, type ScanRequest, type ScanResult } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { DEFAULT_ENTRY_GLOBS, extractPathsFromSource, normalizeRrPath, rrToPattern } from './rr-paths';
import { mergeRrParams, scanTanStack } from './tanstack-scan';
export { extractPathsFromSource, normalizeRrPath, rrToPattern } from './rr-paths';

export { linkTargets, parseTanStackRoutes, tanstackToPattern, type TanStackLink, type TanStackRoute } from './tanstack';

export type ReactRouterScanOptions = ScanRequest & {
  /** Файлы-точки входа с route objects (относительно app root) */
  readonly entries?: readonly string[];
};

const NAV_FILE = /(route-config|routes-config|router|nav)\.(ts|tsx)$/;

/** Файлы конфига маршрутов: заданные (или стандартные) точки входа и файлы навигации src/. */
function entryFilesOf(absRoot: string, entries: readonly string[]): string[] {
  const entryFiles = entries.filter((e) => existsSync(path.join(absRoot, e))).map((e) => e.replace(/\\/g, '/'));
  // Also scan shell nav for admin-style path catalogs (paths relative to app root)
  const navFiles = walkFiles(path.join(absRoot, 'src'))
    .filter((f) => NAV_FILE.test(f) || f.endsWith('/nav.ts') || f.endsWith('/nav.tsx'))
    .map((f) => `src/${f.replace(/\\/g, '/')}`.replace(/\/+/g, '/'));
  for (const posix of navFiles) {
    if (!entryFiles.includes(posix) && !posix.includes('__tests__')) {
      entryFiles.push(posix);
    }
  }
  return entryFiles;
}

/** Прочитанные файлы конфига (нечитаемые пропускаются). */
function readEntries(absRoot: string, entryFiles: readonly string[]): [string, string][] {
  return entryFiles.flatMap((rel): [string, string][] => {
    try {
      return [[rel, readFileSync(path.join(absRoot, rel), 'utf8')]];
    } catch {
      return [];
    }
  });
}

/** Абсолютные пути конфига → файл, где путь встретился последним. */
function routePaths(sources: readonly [string, string][]): Map<string, string> {
  const pathSources = new Map<string, string>();
  for (const [rel, source] of sources) {
    for (const p of extractPathsFromSource(source)) {
      pathSources.set(normalizeRrPath(p), rel);
    }
  }
  return pathSources;
}

function rrNode(raw: string, file: string | undefined, exampleParams: ExampleParamsConfig, baseUrl: string | null, diagnostics: Diagnostic[]): AppMapNode {
  const pattern = rrToPattern(raw);
  const { path: pathExample, missing } = materializePath(pattern, mergeRrParams(exampleParams));
  for (const p of missing) {
    diagnostics.push(diag('MISSING_EXAMPLE_PARAM', { message: `Нет example для ${p} в ${pattern}`, path: pattern }));
  }
  return {
    id: `route:${pattern}`,
    kind: 'page',
    title: humanTitle(pattern),
    pathPattern: pattern,
    pathExample,
    url: absoluteUrl(pathExample, baseUrl),
    source: file ? { file } : undefined,
    dynamicParams: extractDynamicParams(pattern),
    iframePolicy: { enabled: true },
    metadata: { router: 'react-router', rrPath: raw },
  };
}

/** Абсолютный адрес примера; без baseUrl или при ошибке разбора — нет. */
function absoluteUrl(pathExample: string, baseUrl: string | null): string | undefined {
  if (baseUrl === null) {
    return undefined;
  }
  try {
    return new URL(pathExample, baseUrl).href;
  } catch {
    return undefined;
  }
}

const LINK_RE = /(?:to|href|path)\s*[:=]\s*["'`](\/[^"'`*]+)["'`]/g;

/** Рёбра по порядку путей в файле конфига: от предыдущего найденного экрана к следующему. */
function navEdges(sources: readonly [string, string][], routeIndex: ReadonlyMap<string, string>): AppMapEdge[] {
  const edges: AppMapEdge[] = [];
  for (const [rel, source] of sources) {
    const seen = new Set<string>();
    let prev = 'route:/';
    for (const m of source.matchAll(LINK_RE)) {
      const pattern = rrToPattern((m[1] ?? '').split('?')[0] ?? '');
      const toId = routeIndex.get(pattern);
      const edgeId = `edge:${prev}->${toId}`;
      if (toId && !seen.has(edgeId)) {
        seen.add(edgeId);
        edges.push({ id: edgeId, from: prev, to: toId, kind: 'link', confidence: 'medium', label: pattern, source: { file: rel, line: 1, column: m.index } });
        prev = toId;
      }
    }
  }
  return edges;
}

/** Документ сканера React Router. */
function rrDocument(absRoot: string, baseUrl: string | null, nodes: AppMapNode[], edges: AppMapEdge[]): ScanResult['document'] {
  return assembleDocument({ projectRoot: absRoot, projectName: path.basename(absRoot), framework: 'react-router', baseUrl, nodes, edges, generatorName: '@live-app-map/scanner-react-router' });
}

/** Итог: один экран и не больше одного пути — маршрутов нет, иначе SCAN_OK со счётчиками. */
function rrResultDiagnostic(nodeCount: number, pathCount: number, edgeCount: number, absRoot: string): Diagnostic {
  return nodeCount <= 1 && pathCount <= 1
    ? diag('NO_ROUTES_FOUND', { file: absRoot })
    : diag('SCAN_OK', { message: `RR: ${nodeCount} routes, ${edgeCount} edges` });
}

/** Итог скана приложения на TanStack Router. */
function tanstackResult(tanstack: NonNullable<ReturnType<typeof scanTanStack>>, absRoot: string, baseUrl: string | null, t0: number): ScanResult {
  const t1 = Date.now();
  return {
    document: rrDocument(absRoot, baseUrl, tanstack.nodes, tanstack.edges),
    diagnostics: [...tanstack.diagnostics, diag('SCAN_OK', { message: `TanStack Router: ${tanstack.nodes.length} routes, ${tanstack.edges.length} edges` })],
    timing: { discoverMs: t1 - t0, edgesMs: 0, totalMs: t1 - t0 },
  };
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
  const tanstack = scanTanStack(absRoot, exampleParams, baseUrl);
  if (tanstack !== null) {
    return tanstackResult(tanstack, absRoot, baseUrl, t0);
  }
  const diagnostics: Diagnostic[] = [];
  const entryFiles = entryFilesOf(absRoot, request.entries ?? DEFAULT_ENTRY_GLOBS);
  if (entryFiles.length === 0) {
    diagnostics.push(diag('NO_ROUTES_FOUND', { message: 'Не найдены route config entry files', file: absRoot }));
  }
  const sources = readEntries(absRoot, entryFiles);
  const pathSources = routePaths(sources);
  // Корень добавляем только если уже есть реальные path (иначе dual-scan
  // framework=unknown всегда «выигрывает» RR с 1 synthetic page).
  const rawPaths = new Set(pathSources.size > 0 ? [...pathSources.keys(), '/'] : []);
  const nodes = [...rawPaths].sort().filter((raw) => raw !== '*').map((raw) => rrNode(raw, pathSources.get(raw), exampleParams, baseUrl, diagnostics));
  const edges = navEdges(sources, new Map(nodes.map((n) => [n.pathPattern, n.id])));
  const document = rrDocument(absRoot, baseUrl, nodes, edges);
  const t1 = Date.now();
  diagnostics.push(rrResultDiagnostic(nodes.length, rawPaths.size, edges.length, absRoot));
  return { document, diagnostics, timing: { discoverMs: t1 - t0, edgesMs: 0, totalMs: t1 - t0 } };
}
