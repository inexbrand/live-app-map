/**
 * Скан TanStack Router (routeTree / createFileRoute) и примеры параметров в виде React Router.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { extractDynamicParams, humanTitle, materializePath, walkFiles, type ExampleParamsConfig } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { parseTanStackRoutes, tanstackToPattern } from './tanstack';

/**
 * Приложение на TanStack Router: экраны и переходы. Нет маршрутов TanStack — null.
 */
export function scanTanStack(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
): { nodes: AppMapNode[]; edges: AppMapEdge[]; diagnostics: Diagnostic[] } | null {
  const srcRoot = path.join(absRoot, 'src');
  if (!existsSync(srcRoot)) {
    return null;
  }
  const files = new Map<string, string>();
  for (const f of walkFiles(srcRoot)) {
    const rel = `src/${f.replace(/\\/g, '/')}`;
    if (/\.(tsx?|jsx?)$/.test(rel) && !/\.(test|spec|perf-test)\./.test(rel)) {
      files.set(rel, readFileSync(path.join(absRoot, rel), 'utf8'));
    }
  }
  const { routes, links } = parseTanStackRoutes(files);
  if (routes.length === 0) {
    return null;
  }
  const diagnostics: Diagnostic[] = [];
  const idOf = (fullPath: string) => `route:${tanstackToPattern(fullPath)}`;
  const nodes: AppMapNode[] = routes.map((r) => {
    const pattern = tanstackToPattern(r.fullPath);
    const { path: pathExample, missing } = materializePath(pattern, mergeRrParams(exampleParams));
    for (const p of missing) {
      diagnostics.push(diag('MISSING_EXAMPLE_PARAM', { message: `Нет example для ${p} в ${pattern}`, path: pattern }));
    }
    const url = baseUrl === null ? undefined : URL.canParse(pathExample, baseUrl) ? new URL(pathExample, baseUrl).href : undefined;
    return {
      id: idOf(r.fullPath),
      kind: 'page',
      title: humanTitle(pattern),
      pathPattern: pattern,
      pathExample,
      url,
      source: { file: r.componentFile ?? r.file },
      dynamicParams: extractDynamicParams(pattern),
      iframePolicy: { enabled: true },
      metadata: { router: 'tanstack-router', routeFile: r.file },
    };
  });
  const edges: AppMapEdge[] = [...new Map(links.map((l) => {
    const from = idOf(l.fromPath);
    const to = idOf(l.toPath);
    const edge: AppMapEdge = { id: `edge:${from}->${to}`, from, to, kind: l.kind, confidence: l.kind === 'redirect' ? 'high' : l.shared ? 'low' : 'medium', label: tanstackToPattern(l.toPath), source: { file: l.file, line: l.line, column: 1 } };
    return [edge.id, edge];
  })).values()];
  return { nodes, edges, diagnostics };
}

export function mergeRrParams(exampleParams: ExampleParamsConfig): ExampleParamsConfig {
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
