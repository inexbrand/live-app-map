/**
 * Сканер Next.js: App Router + Pages Router, рёбра из литералов (Link / router / redirect).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import {
  assembleDocument,
  extractDynamicParams,
  humanTitle,
  materializePath,
  walkFiles,
  type ExampleParamsConfig,
  type ScanRequest,
  type ScanResult,
} from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';

/** Реэкспорт title-helper из scanner-core (единый источник). */
export { humanTitle };

const PAGE_RE = /^(page|route|layout|loading|error|not-found|default|template)\.(js|jsx|ts|tsx|mdx)$/;
const PAGES_IGNORE = new Set(['_app', '_document', '_error', '_middleware']);

type SegmentKind =
  | { type: 'static'; name: string }
  | { type: 'dynamic'; name: string }
  | { type: 'catchAll'; name: string }
  | { type: 'optionalCatchAll'; name: string }
  | { type: 'group'; name: string }
  | { type: 'parallel'; name: string }
  | { type: 'intercept'; name: string; mode: string };

/**
 * Парсер имени сегмента App Router.
 */
export function parseSegment(folderName: string): SegmentKind {
  if (folderName.startsWith('@')) {
    return { type: 'parallel', name: folderName.slice(1) };
  }
  const intercept = folderName.match(/^\(\.\.\.\)(.+)$|^\(\.\.\)\.\.(.+)$|^\(\.\.\)(.+)$|^\(\.\)(.+)$/);
  if (folderName.startsWith('(.)')) {
    return { type: 'intercept', name: folderName.slice(3), mode: '(.)' };
  }
  if (folderName.startsWith('(..)(..)')) {
    return { type: 'intercept', name: folderName.slice(8), mode: '(..)(..)' };
  }
  if (folderName.startsWith('(...)')) {
    return { type: 'intercept', name: folderName.slice(5), mode: '(...)' };
  }
  if (folderName.startsWith('(..)')) {
    return { type: 'intercept', name: folderName.slice(4), mode: '(..)' };
  }
  if (folderName.startsWith('(') && folderName.endsWith(')')) {
    return { type: 'group', name: folderName.slice(1, -1) };
  }
  if (folderName.startsWith('[[...') && folderName.endsWith(']]')) {
    return { type: 'optionalCatchAll', name: folderName.slice(5, -2) };
  }
  if (folderName.startsWith('[...') && folderName.endsWith(']')) {
    return { type: 'catchAll', name: folderName.slice(4, -1) };
  }
  if (folderName.startsWith('[') && folderName.endsWith(']')) {
    return { type: 'dynamic', name: folderName.slice(1, -1) };
  }
  void intercept;
  return { type: 'static', name: folderName };
}

/**
 * Строит path pattern из списка сегментов (posix, с /).
 */
export function segmentsToPattern(segments: readonly SegmentKind[]): {
  pattern: string;
  groups: string[];
  parallelSlot: string | null;
  intercept: { type: string; targetPathPattern?: string } | null;
} {
  const parts: string[] = [];
  const groups: string[] = [];
  let parallelSlot: string | null = null;
  let intercept: { type: string; targetPathPattern?: string } | null = null;

  for (const s of segments) {
    switch (s.type) {
      case 'static':
        parts.push(s.name);
        break;
      case 'dynamic':
        parts.push(`[${s.name}]`);
        break;
      case 'catchAll':
        parts.push(`[...${s.name}]`);
        break;
      case 'optionalCatchAll':
        parts.push(`[[...${s.name}]]`);
        break;
      case 'group':
        groups.push(s.name);
        break;
      case 'parallel':
        parallelSlot = s.name;
        break;
      case 'intercept':
        intercept = { type: s.mode };
        parts.push(s.name);
        break;
      default:
        break;
    }
  }
  const pattern = parts.length === 0 ? '/' : `/${parts.join('/')}`;
  return { pattern, groups, parallelSlot, intercept };
}

function resolveAppDir(absRoot: string): { appDir: string; rel: string } | null {
  const srcApp = path.join(absRoot, 'src', 'app');
  const app = path.join(absRoot, 'app');
  if (existsSync(srcApp)) {
    return { appDir: srcApp, rel: 'src/app' };
  }
  if (existsSync(app)) {
    return { appDir: app, rel: 'app' };
  }
  return null;
}

function resolvePagesDir(absRoot: string): { pagesDir: string; rel: string } | null {
  const srcPages = path.join(absRoot, 'src', 'pages');
  const pages = path.join(absRoot, 'pages');
  if (existsSync(srcPages)) {
    return { pagesDir: srcPages, rel: 'src/pages' };
  }
  if (existsSync(pages)) {
    return { pagesDir: pages, rel: 'pages' };
  }
  return null;
}

function discoverAppRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): { nodes: AppMapNode[]; diagnostics: Diagnostic[]; layouts: AppMapNode[] } {
  const diagnostics: Diagnostic[] = [];
  const nodes: AppMapNode[] = [];
  const layouts: AppMapNode[] = [];
  const found = resolveAppDir(absRoot);
  if (!found) {
    return { nodes, diagnostics, layouts };
  }

  const files = walkFiles(found.appDir);
  for (const rel of files) {
    const base = path.posix.basename(rel);
    const m = base.match(PAGE_RE);
    if (!m) {
      continue;
    }
    const kindFile = m[1];
    const dir = path.posix.dirname(rel);
    const segs =
      dir === '.'
        ? []
        : dir.split('/').map((s) => parseSegment(s));
    const { pattern, groups, parallelSlot, intercept } = segmentsToPattern(segs);
    const sourceFile = path.posix.join(found.rel, rel);

    if (kindFile === 'layout') {
      const id = `layout:${pattern}`;
      layouts.push({
        id,
        kind: 'layout',
        title: `Макет ${pattern}`,
        pathPattern: pattern,
        source: { file: sourceFile },
        groupIds: groups.length ? groups : undefined,
        iframePolicy: { enabled: false, reason: 'layout is structure-only' },
      });
      continue;
    }

    if (kindFile === 'route') {
      if (!includeRouteHandlers) {
        continue;
      }
      nodes.push({
        id: `route-handler:${pattern}`,
        kind: 'route-handler',
        title: `API ${pattern}`,
        pathPattern: pattern,
        source: { file: sourceFile },
        iframePolicy: { enabled: false, reason: 'route handler' },
        tags: ['api'],
      });
      continue;
    }

    if (kindFile === 'loading' || kindFile === 'error' || kindFile === 'template' || kindFile === 'default') {
      continue;
    }

    const isNotFound = kindFile === 'not-found';
    const { path: pathExample, missing } = materializePath(pattern, exampleParams);
    for (const p of missing) {
      diagnostics.push(
        diag('MISSING_EXAMPLE_PARAM', {
          message: `Нет example для [${p}] в ${pattern}`,
          path: pattern,
          file: sourceFile,
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

    const id = isNotFound
      ? `not-found:${pattern}`
      : intercept
        ? `intercept:${pattern}`
        : `route:${pattern}`;

    nodes.push({
      id,
      kind: isNotFound ? 'not-found' : intercept ? 'intercept' : 'page',
      title: humanTitle(pattern),
      pathPattern: pattern,
      pathExample,
      url,
      source: { file: sourceFile },
      groupIds: groups.length ? groups : undefined,
      dynamicParams: extractDynamicParams(pattern),
      parallelSlot,
      intercept,
      presentation: intercept ? 'intercept' : 'page',
      iframePolicy: {
        enabled: !isNotFound || true,
      },
      tags: parallelSlot ? [`slot:${parallelSlot}`] : undefined,
    });
  }

  return { nodes, diagnostics, layouts };
}

function discoverPagesRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): { nodes: AppMapNode[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const nodes: AppMapNode[] = [];
  const found = resolvePagesDir(absRoot);
  if (!found) {
    return { nodes, diagnostics };
  }
  const files = walkFiles(found.pagesDir);
  for (const rel of files) {
    if (!/\.(js|jsx|ts|tsx)$/.test(rel)) {
      continue;
    }
    if (rel.includes('/api/') || rel.startsWith('api/')) {
      if (!includeRouteHandlers) {
        continue;
      }
    }
    const noExt = rel.replace(/\.(js|jsx|ts|tsx)$/, '');
    const base = path.posix.basename(noExt);
    if (PAGES_IGNORE.has(base) || base.startsWith('_')) {
      continue;
    }
    let pattern = '/' + noExt.replace(/\\/g, '/');
    pattern = pattern.replace(/\/index$/, '') || '/';
    if (pattern !== '/') {
      // pages dynamic: [id] already in path
    }
    const isApi = pattern.startsWith('/api/') || pattern === '/api';
    const { path: pathExample, missing } = materializePath(pattern, exampleParams);
    for (const p of missing) {
      diagnostics.push(
        diag('MISSING_EXAMPLE_PARAM', {
          path: pattern,
          file: path.posix.join(found.rel, rel),
        }),
      );
    }
    const sourceFile = path.posix.join(found.rel, rel);
    const url =
      baseUrl && !isApi
        ? (() => {
            try {
              return new URL(pathExample, baseUrl).href;
            } catch {
              return undefined;
            }
          })()
        : undefined;
    nodes.push({
      id: isApi ? `route-handler:${pattern}` : `route:${pattern}`,
      kind: isApi ? 'route-handler' : 'page',
      title: humanTitle(pattern),
      pathPattern: pattern,
      pathExample: isApi ? pattern : pathExample,
      url,
      source: { file: sourceFile },
      dynamicParams: extractDynamicParams(pattern),
      iframePolicy: { enabled: !isApi },
      metadata: { router: 'pages' },
    });
  }
  return { nodes, diagnostics };
}

/**
 * Простой extractor: next/link href="/..." и router.push('/...')
 */
export function extractEdgesFromSource(
  source: string,
  file: string,
  fromRouteId: string,
  routeIndex: Map<string, string>,
): { edges: AppMapEdge[]; diagnostics: Diagnostic[] } {
  const edges: AppMapEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const patterns: Array<{ re: RegExp; kind: AppMapEdge['kind'] }> = [
    { re: /<Link\b[^>]*\bhref=["']([^"']+)["']/g, kind: 'link' },
    { re: /href:\s*["']([^"']+)["']/g, kind: 'link' },
    { re: /router\.(push|replace)\(\s*["']([^"']+)["']/g, kind: 'push' },
    { re: /\bredirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
    { re: /\bpermanentRedirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
  ];

  for (const { re, kind } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      let href: string;
      let edgeKind = kind;
      if (kind === 'push' && m[2]) {
        href = m[2];
        edgeKind = m[1] === 'replace' ? 'replace' : 'push';
      } else {
        href = m[1] ?? '';
      }
      if (!href.startsWith('/') || href.startsWith('//')) {
        continue;
      }
      const pathOnly = href.split('?')[0]?.split('#')[0] ?? href;
      const toId = matchRoute(pathOnly, routeIndex);
      const id = `edge:${fromRouteId}->${toId ?? pathOnly}:${edgeKind}:${m.index}`;
      edges.push({
        id,
        from: fromRouteId,
        to: toId,
        kind: edgeKind,
        confidence: toId ? 'high' : 'medium',
        raw: m[0].slice(0, 80),
        label: pathOnly,
        source: { file, line: 1, column: m.index },
      });
      if (!toId) {
        diagnostics.push(
          diag('UNRESOLVED_TARGET', {
            message: `Не сопоставлен href ${pathOnly}`,
            file,
          }),
        );
      }
    }
  }
  return { edges, diagnostics };
}

/**
 * Сопоставить pathname с route id (динамические сегменты).
 */
export function matchRoute(
  pathname: string,
  routeIndex: Map<string, string>,
): string | null {
  if (routeIndex.has(pathname)) {
    return routeIndex.get(pathname) ?? null;
  }
  // try pattern match
  for (const [pattern, id] of routeIndex) {
    if (patternMatches(pattern, pathname)) {
      return id;
    }
  }
  return null;
}

function patternMatches(pattern: string, pathname: string): boolean {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = pathname.split('/').filter(Boolean);
  // optional catch-all can be empty
  if (pParts.length === 0 && uParts.length === 0) {
    return true;
  }
  let ui = 0;
  for (let pi = 0; pi < pParts.length; pi++) {
    const p = pParts[pi] ?? '';
    if (p.startsWith('[[...') && p.endsWith(']]')) {
      return true;
    }
    if (p.startsWith('[...') && p.endsWith(']')) {
      return ui < uParts.length || true;
    }
    if (p.startsWith('[') && p.endsWith(']')) {
      if (ui >= uParts.length) {
        return false;
      }
      ui++;
      continue;
    }
    if (uParts[ui] !== p) {
      return false;
    }
    ui++;
  }
  return ui === uParts.length;
}

function buildWrapsEdges(layouts: AppMapNode[], pages: AppMapNode[]): AppMapEdge[] {
  const edges: AppMapEdge[] = [];
  for (const page of pages) {
    // find longest layout prefix
    let best: AppMapNode | null = null;
    for (const layout of layouts) {
      const lp = layout.pathPattern;
      if (
        page.pathPattern === lp ||
        page.pathPattern.startsWith(lp === '/' ? '/' : `${lp}/`) ||
        lp === '/'
      ) {
        if (
          !best ||
          layout.pathPattern.length > best.pathPattern.length ||
          (layout.pathPattern !== '/' && best.pathPattern === '/')
        ) {
          if (lp === '/' || page.pathPattern === lp || page.pathPattern.startsWith(`${lp}/`)) {
            best = layout;
          }
        }
      }
    }
    // prefer deepest non-root if available
    const candidates = layouts.filter((layout) => {
      const lp = layout.pathPattern;
      if (lp === '/') {
        return true;
      }
      return page.pathPattern === lp || page.pathPattern.startsWith(`${lp}/`);
    });
    candidates.sort((a, b) => b.pathPattern.length - a.pathPattern.length);
    const layout = candidates[0];
    if (layout) {
      edges.push({
        id: `wraps:${layout.id}->${page.id}`,
        from: layout.id,
        to: page.id,
        kind: 'wraps',
        confidence: 'high',
        label: 'wraps',
      });
    }
  }
  return edges;
}

/**
 * Скан Next.js приложения.
 */
export async function scanNextApp(request: ScanRequest): Promise<ScanResult> {
  const t0 = Date.now();
  const absRoot = path.resolve(request.appRoot ?? request.projectRoot);
  const exampleParams = request.exampleParams ?? {};
  const baseUrl = request.baseUrl ?? null;
  const includeRouteHandlers = request.includeRouteHandlers ?? false;
  const diagnostics: Diagnostic[] = [];

  const appPart = discoverAppRouter(absRoot, exampleParams, baseUrl, includeRouteHandlers);
  const pagesPart = discoverPagesRouter(absRoot, exampleParams, baseUrl, includeRouteHandlers);
  diagnostics.push(...appPart.diagnostics, ...pagesPart.diagnostics);

  const tDiscover = Date.now();
  const hasApp = appPart.nodes.length > 0 || appPart.layouts.length > 0;
  const hasPages = pagesPart.nodes.length > 0;
  if (!hasApp && !hasPages) {
    diagnostics.push(diag('NO_APP_DIR', { file: absRoot }));
  }
  if (hasApp && hasPages) {
    diagnostics.push(diag('HYBRID_ROUTER'));
  }

  // dedupe by id (prefer app router)
  const nodeMap = new Map<string, AppMapNode>();
  for (const n of pagesPart.nodes) {
    nodeMap.set(n.id, n);
  }
  for (const n of [...appPart.layouts, ...appPart.nodes]) {
    nodeMap.set(n.id, n);
  }
  const nodes = [...nodeMap.values()];

  // edge extraction
  const routeIndex = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === 'page' || n.kind === 'not-found') {
      routeIndex.set(n.pathPattern, n.id);
      if (n.pathExample) {
        routeIndex.set(n.pathExample, n.id);
      }
    }
  }

  const edges: AppMapEdge[] = [];
  const tEdges0 = Date.now();
  let edgeFiles = 0;
  for (const n of nodes) {
    if (!n.source?.file) {
      continue;
    }
    if (edgeFiles >= 5000) {
      diagnostics.push(diag('EDGE_SCAN_TRUNCATED'));
      break;
    }
    const absFile = path.join(absRoot, n.source.file);
    if (!existsSync(absFile)) {
      // source path may already be relative to monorepo; try as-is from projectRoot
      continue;
    }
    let source: string;
    try {
      source = readFileSync(absFile, 'utf8');
    } catch {
      continue;
    }
    edgeFiles++;
    const extracted = extractEdgesFromSource(source, n.source.file, n.id, routeIndex);
    edges.push(...extracted.edges);
    diagnostics.push(...extracted.diagnostics);
  }

  edges.push(...buildWrapsEdges(appPart.layouts, nodes.filter((n) => n.kind === 'page')));

  // groups from route groups
  const groupIds = new Set<string>();
  for (const n of nodes) {
    for (const g of n.groupIds ?? []) {
      groupIds.add(g);
    }
  }
  const groups = [...groupIds].map((id, order) => ({
    id,
    title: id,
    order,
  }));

  const document = assembleDocument({
    projectRoot: absRoot,
    projectName: path.basename(absRoot),
    framework: hasApp && hasPages ? 'hybrid' : 'next',
    baseUrl,
    nodes,
    edges,
    generatorName: '@live-app-map/scanner-next',
    next: {
      router: hasApp && hasPages ? 'hybrid' : hasApp ? 'app' : 'pages',
    },
    groups: groups.length ? groups : undefined,
  });

  const t1 = Date.now();
  if (nodes.filter((n) => n.kind === 'page').length === 0) {
    diagnostics.push(diag('NO_ROUTES_FOUND', { file: absRoot }));
  } else {
    diagnostics.push(
      diag('SCAN_OK', {
        message: `Найдено ${nodes.length} nodes, ${edges.length} edges`,
      }),
    );
  }

  return {
    document,
    diagnostics,
    timing: {
      discoverMs: tDiscover - t0,
      edgesMs: t1 - tEdges0,
      totalMs: t1 - t0,
    },
  };
}
