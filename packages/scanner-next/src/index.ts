/**
 * Сканер Next.js: App Router + Pages Router, рёбра из литералов (Link / router / redirect).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { assembleDocument, humanTitle, type ScanRequest, type ScanResult } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { discoverAppRouter, discoverPagesRouter } from './discover';
import { buildWrapsEdges, extractEdgesFromSource } from './edges';
export { extractEdgesFromSource, matchRoute } from './edges';
export { parseSegment, segmentsToPattern } from './segments';

/** Реэкспорт title-helper из scanner-core (единый источник). */
export { humanTitle };

/** Предел файлов для поиска переходов. */
const EDGE_FILES_MAX = 5000;

/** Диагностики раскладки: ни одного роутера или оба сразу. */
function routerDiagnostics(hasApp: boolean, hasPages: boolean, absRoot: string): Diagnostic[] {
  if (!hasApp && !hasPages) {
    return [diag('NO_APP_DIR', { file: absRoot })];
  }
  return hasApp && hasPages ? [diag('HYBRID_ROUTER')] : [];
}

/** Ноды без повторов id: App Router важнее Pages. */
function dedupeNodes(pagesNodes: readonly AppMapNode[], appNodes: readonly AppMapNode[]): AppMapNode[] {
  const nodeMap = new Map<string, AppMapNode>();
  for (const n of [...pagesNodes, ...appNodes]) {
    nodeMap.set(n.id, n);
  }
  return [...nodeMap.values()];
}

/** Путь (шаблон и пример) → id экрана для сопоставления переходов. */
function routeIndexOf(nodes: readonly AppMapNode[]): Map<string, string> {
  const routeIndex = new Map<string, string>();
  for (const n of nodes.filter((x) => x.kind === 'page' || x.kind === 'not-found')) {
    routeIndex.set(n.pathPattern, n.id);
    if (n.pathExample) {
      routeIndex.set(n.pathExample, n.id);
    }
  }
  return routeIndex;
}

/** Текст файла; нет или не читается — null. */
function readSource(absFile: string): string | null {
  if (!existsSync(absFile)) {
    return null;
  }
  try {
    return readFileSync(absFile, 'utf8');
  } catch {
    return null;
  }
}

/** Переходы из исходников нод (не больше EDGE_FILES_MAX прочитанных файлов). */
function sourceEdges(nodes: readonly AppMapNode[], absRoot: string, routeIndex: Map<string, string>): { edges: AppMapEdge[]; diagnostics: Diagnostic[] } {
  const edges: AppMapEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  let edgeFiles = 0;
  for (const n of nodes) {
    const file = n.source?.file;
    if (!file) {
      continue;
    }
    if (edgeFiles >= EDGE_FILES_MAX) {
      diagnostics.push(diag('EDGE_SCAN_TRUNCATED'));
      break;
    }
    const source = readSource(path.join(absRoot, file));
    if (source !== null) {
      edgeFiles++;
      const extracted = extractEdgesFromSource(source, file, n.id, routeIndex);
      edges.push(...extracted.edges);
      diagnostics.push(...extracted.diagnostics);
    }
  }
  return { edges, diagnostics };
}

/** Группы из route groups нод, по порядку появления. */
function groupsOf(nodes: readonly AppMapNode[]): { id: string; title: string; order: number }[] {
  return [...new Set(nodes.flatMap((n) => n.groupIds ?? []))].map((id, order) => ({ id, title: id, order }));
}

function routerOf(hasApp: boolean, hasPages: boolean): 'hybrid' | 'app' | 'pages' {
  if (hasApp && hasPages) {
    return 'hybrid';
  }
  return hasApp ? 'app' : 'pages';
}

/** Итог скана: нет страниц — NO_ROUTES_FOUND, иначе SCAN_OK со счётчиками. */
function resultDiagnostic(nodes: readonly AppMapNode[], edgeCount: number, absRoot: string): Diagnostic {
  return nodes.some((n) => n.kind === 'page')
    ? diag('SCAN_OK', { message: `Найдено ${nodes.length} nodes, ${edgeCount} edges` })
    : diag('NO_ROUTES_FOUND', { file: absRoot });
}

/**
 * Скан Next.js приложения.
 */
export async function scanNextApp(request: ScanRequest): Promise<ScanResult> {
  const t0 = Date.now();
  const absRoot = path.resolve(request.appRoot ?? request.projectRoot);
  const baseUrl = request.baseUrl ?? null;
  const exampleParams = request.exampleParams ?? {};
  const withHandlers = request.includeRouteHandlers ?? false;
  const appPart = discoverAppRouter(absRoot, exampleParams, baseUrl, withHandlers);
  const pagesPart = discoverPagesRouter(absRoot, exampleParams, baseUrl, withHandlers);
  const tDiscover = Date.now();
  const hasApp = appPart.nodes.length > 0 || appPart.layouts.length > 0;
  const hasPages = pagesPart.nodes.length > 0;
  const nodes = dedupeNodes(pagesPart.nodes, [...appPart.layouts, ...appPart.nodes]);
  const tEdges0 = Date.now();
  const found = sourceEdges(nodes, absRoot, routeIndexOf(nodes));
  const edges = [...found.edges, ...buildWrapsEdges(appPart.layouts, nodes.filter((n) => n.kind === 'page'))];
  const groups = groupsOf(nodes);
  const router = routerOf(hasApp, hasPages);
  const document = assembleDocument({
    projectRoot: absRoot,
    projectName: path.basename(absRoot),
    framework: router === 'hybrid' ? 'hybrid' : 'next',
    baseUrl,
    nodes,
    edges,
    generatorName: '@live-app-map/scanner-next',
    next: { router },
    groups: groups.length ? groups : undefined,
  });
  const t1 = Date.now();
  const diagnostics = [
    ...appPart.diagnostics,
    ...pagesPart.diagnostics,
    ...routerDiagnostics(hasApp, hasPages, absRoot),
    ...found.diagnostics,
    resultDiagnostic(nodes, edges.length, absRoot),
  ];
  return {
    document,
    diagnostics,
    timing: { discoverMs: tDiscover - t0, edgesMs: t1 - tEdges0, totalMs: t1 - t0 },
  };
}
