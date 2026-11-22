/**
 * Скан TanStack Router (routeTree / createFileRoute) и примеры параметров в виде React Router.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { extractDynamicParams, humanTitle, materializePath, walkFiles, type ExampleParamsConfig } from '@live-app-map/scanner-core';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';
import { parseTanStackRoutes, tanstackToPattern, type TanStackLink, type TanStackRoute } from './tanstack';

const CODE_FILE = /\.(tsx?|jsx?)$/;
const TEST_FILE = /\.(test|spec|perf-test)\./;

/** Исходники src/ (без тестов): путь от корня приложения → текст. */
function sourceFiles(absRoot: string, srcRoot: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const f of walkFiles(srcRoot)) {
    const rel = `src/${f.replace(/\\/g, '/')}`;
    if (CODE_FILE.test(rel) && !TEST_FILE.test(rel)) {
      files.set(rel, readFileSync(path.join(absRoot, rel), 'utf8'));
    }
  }
  return files;
}

/**
 * Абсолютный адрес примера пути; без baseUrl или если не разбирается — нет.
 *
 * @param pathExample - путь с подставленными параметрами
 * @param baseUrl - адрес приложения
 */
export function exampleUrl(pathExample: string, baseUrl: string | null): string | undefined {
  return baseUrl !== null && URL.canParse(pathExample, baseUrl) ? new URL(pathExample, baseUrl).href : undefined;
}

const idOf = (fullPath: string): string => `route:${tanstackToPattern(fullPath)}`;

function tanstackNode(r: TanStackRoute, exampleParams: ExampleParamsConfig, baseUrl: string | null, diagnostics: Diagnostic[]): AppMapNode {
  const pattern = tanstackToPattern(r.fullPath);
  const { path: pathExample, missing } = materializePath(pattern, mergeRrParams(exampleParams));
  for (const p of missing) {
    diagnostics.push(diag('MISSING_EXAMPLE_PARAM', { message: `Нет example для ${p} в ${pattern}`, path: pattern }));
  }
  return {
    id: idOf(r.fullPath),
    kind: 'page',
    title: humanTitle(pattern),
    pathPattern: pattern,
    pathExample,
    url: exampleUrl(pathExample, baseUrl),
    source: { file: r.componentFile ?? r.file },
    dynamicParams: extractDynamicParams(pattern),
    iframePolicy: { enabled: true },
    metadata: { router: 'tanstack-router', routeFile: r.file },
  };
}

/** Уверенность перехода: redirect — высокая, из общего файла — низкая. */
function confidenceOf(l: TanStackLink): AppMapEdge['confidence'] {
  if (l.kind === 'redirect') {
    return 'high';
  }
  return l.shared ? 'low' : 'medium';
}

function tanstackEdge(l: TanStackLink): AppMapEdge {
  const from = idOf(l.fromPath);
  const to = idOf(l.toPath);
  return { id: `edge:${from}->${to}`, from, to, kind: l.kind, confidence: confidenceOf(l), label: tanstackToPattern(l.toPath), source: { file: l.file, line: l.line, column: 1 } };
}

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
  const { routes, links } = parseTanStackRoutes(sourceFiles(absRoot, srcRoot));
  if (routes.length === 0) {
    return null;
  }
  const diagnostics: Diagnostic[] = [];
  const nodes = routes.map((r) => tanstackNode(r, exampleParams, baseUrl, diagnostics));
  // Повтор перехода (тот же id) — последний выигрывает, место — первого.
  const edges = [...new Map(links.map((l) => {
    const edge = tanstackEdge(l);
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