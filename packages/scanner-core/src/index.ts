/**
 * Ядро сканера: walk, ignore, example params, сборка документа.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import type { AppMapDocument, AppMapEdge, AppMapNode, Diagnostic, FrameworkKind } from '@live-app-map/schema';
import { FORMAT_VERSION } from '@live-app-map/schema';
import { DEFAULT_EXCLUDE } from './walk';
import type { ExampleParamsConfig } from './example-params';
export { getExampleParam, type ExampleParamsByRoute, type ExampleParamsConfig, type ParamExampleValue } from './example-params';
export { extractDynamicParams, humanTitle, materializePath } from './paths';
export { isExcluded, walkFiles, type WalkFilesOptions, type WalkFsError } from './walk';

/** Реэкспорт framework kind для CLI / defineConfig. */
export type { FrameworkKind };

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
