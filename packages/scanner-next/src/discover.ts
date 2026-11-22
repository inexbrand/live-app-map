/**
 * Поиск экранов Next.js: App Router (app/) и Pages Router (pages/).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { diag } from '@live-app-map/diagnostics';
import { extractDynamicParams, humanTitle, materializePath, walkFiles, type ExampleParamsConfig } from '@live-app-map/scanner-core';
import type { AppMapNode, Diagnostic } from '@live-app-map/schema';
import { parseSegment, segmentsToPattern } from './segments';

const PAGE_RE = /^(page|route|layout|loading|error|not-found|default|template)\.(js|jsx|ts|tsx|mdx)$/;
const PAGES_IGNORE = new Set(['_app', '_document', '_error', '_middleware']);

/** Каталог роутера: `src/<name>`, иначе `<name>` в корне приложения. */
function resolveRouterDir(absRoot: string, name: 'app' | 'pages'): { dir: string; rel: string } | null {
  for (const rel of [`src/${name}`, name]) {
    const dir = path.join(absRoot, rel);
    if (existsSync(dir)) {
      return { dir, rel };
    }
  }
  return null;
}

export function discoverAppRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): { nodes: AppMapNode[]; diagnostics: Diagnostic[]; layouts: AppMapNode[] } {
  const diagnostics: Diagnostic[] = [];
  const nodes: AppMapNode[] = [];
  const layouts: AppMapNode[] = [];
  const found = resolveRouterDir(absRoot, 'app');
  if (!found) {
    return { nodes, diagnostics, layouts };
  }

  const files = walkFiles(found.dir);
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

export function discoverPagesRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): { nodes: AppMapNode[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const nodes: AppMapNode[] = [];
  const found = resolveRouterDir(absRoot, 'pages');
  if (!found) {
    return { nodes, diagnostics };
  }
  const files = walkFiles(found.dir);
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
