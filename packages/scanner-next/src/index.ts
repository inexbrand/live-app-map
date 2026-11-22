/**
 * Сканер Next.js: App Router + Pages Router, рёбра из литералов (Link / router / redirect).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { assembleDocument, humanTitle, type ScanRequest, type ScanResult } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { discoverAppRouter, discoverPagesRouter, resolveRouterDir } from './discover';
import { buildWrapsEdges, extractEdgesFromSource, matchRoute } from './edges';
export { extractEdgesFromSource, matchRoute } from './edges';
export { parseSegment, segmentsToPattern } from './segments';

/** Реэкспорт title-helper из scanner-core (единый источник). */
export { humanTitle };

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
