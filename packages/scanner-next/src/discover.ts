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

/** Параметры поиска экранов. */
type DiscoverOptions = {
  readonly exampleParams: ExampleParamsConfig;
  readonly baseUrl: string | null;
  readonly includeRouteHandlers: boolean;
};

/** Служебные файлы App Router, которые не дают экрана. */
const APP_SKIPPED = new Set(['loading', 'error', 'template', 'default']);

/** Абсолютный адрес примера пути; без baseUrl или при ошибке разбора — нет. */
function absoluteUrl(pathExample: string, baseUrl: string | null): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  try {
    return new URL(pathExample, baseUrl).href;
  } catch {
    return undefined;
  }
}

function nonEmpty(list: string[]): string[] | undefined {
  return list.length ? list : undefined;
}

type AppRoute = ReturnType<typeof segmentsToPattern>;

/** Вид ноды экрана App Router и префикс её id. */
function appPageKind(isNotFound: boolean, intercept: AppRoute['intercept']): { readonly kind: 'not-found' | 'intercept' | 'page'; readonly prefix: string } {
  if (isNotFound) {
    return { kind: 'not-found', prefix: 'not-found' };
  }
  return intercept ? { kind: 'intercept', prefix: 'intercept' } : { kind: 'page', prefix: 'route' };
}

/** Экран App Router (page или not-found) и диагностики пропущенных примеров параметров. */
function appPageNode(route: AppRoute, isNotFound: boolean, sourceFile: string, opts: DiscoverOptions, diagnostics: Diagnostic[]): AppMapNode {
  const { pattern, groups, parallelSlot, intercept } = route;
  const { path: pathExample, missing } = materializePath(pattern, opts.exampleParams);
  for (const p of missing) {
    diagnostics.push(diag('MISSING_EXAMPLE_PARAM', { message: `Нет example для [${p}] в ${pattern}`, path: pattern, file: sourceFile }));
  }
  const { kind, prefix } = appPageKind(isNotFound, intercept);
  return {
    id: `${prefix}:${pattern}`,
    kind,
    title: humanTitle(pattern),
    pathPattern: pattern,
    pathExample,
    url: absoluteUrl(pathExample, opts.baseUrl),
    source: { file: sourceFile },
    groupIds: nonEmpty(groups),
    dynamicParams: extractDynamicParams(pattern),
    parallelSlot,
    intercept,
    presentation: intercept ? 'intercept' : 'page',
    iframePolicy: { enabled: true },
    tags: parallelSlot ? [`slot:${parallelSlot}`] : undefined,
  };
}

type AppPart = { nodes: AppMapNode[]; diagnostics: Diagnostic[]; layouts: AppMapNode[] };

/** Файл app/: макет, обработчик (если включены), экран или служебный файл без ноды. */
function addAppFile(out: AppPart, kindFile: string, rel: string, sourceFile: string, opts: DiscoverOptions): void {
  const dir = path.posix.dirname(rel);
  const route = segmentsToPattern(dir === '.' ? [] : dir.split('/').map((s) => parseSegment(s)));
  const { pattern } = route;
  if (kindFile === 'layout') {
    out.layouts.push({
      id: `layout:${pattern}`,
      kind: 'layout',
      title: `Макет ${pattern}`,
      pathPattern: pattern,
      source: { file: sourceFile },
      groupIds: nonEmpty(route.groups),
      iframePolicy: { enabled: false, reason: 'layout is structure-only' },
    });
  } else if (kindFile === 'route') {
    if (opts.includeRouteHandlers) {
      out.nodes.push({
        id: `route-handler:${pattern}`,
        kind: 'route-handler',
        title: `API ${pattern}`,
        pathPattern: pattern,
        source: { file: sourceFile },
        iframePolicy: { enabled: false, reason: 'route handler' },
        tags: ['api'],
      });
    }
  } else if (!APP_SKIPPED.has(kindFile)) {
    out.nodes.push(appPageNode(route, kindFile === 'not-found', sourceFile, opts, out.diagnostics));
  }
}

export function discoverAppRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): AppPart {
  const out: AppPart = { nodes: [], diagnostics: [], layouts: [] };
  const found = resolveRouterDir(absRoot, 'app');
  if (!found) {
    return out;
  }
  const opts = { exampleParams, baseUrl, includeRouteHandlers };
  for (const rel of walkFiles(found.dir)) {
    const kindFile = PAGE_RE.exec(path.posix.basename(rel))?.[1];
    if (kindFile !== undefined) {
      addAppFile(out, kindFile, rel, path.posix.join(found.rel, rel), opts);
    }
  }
  return out;
}

const CODE_EXT = /\.(js|jsx|ts|tsx)$/;

/**
 * Шаблон пути файла pages/: не код, служебный (_app, _document…) или API без
 * includeRouteHandlers — null; index — путь папки.
 */
function pagesPattern(rel: string, includeRouteHandlers: boolean): string | null {
  const isApiFile = rel.includes('/api/') || rel.startsWith('api/');
  if (!CODE_EXT.test(rel) || (isApiFile && !includeRouteHandlers)) {
    return null;
  }
  const noExt = rel.replace(CODE_EXT, '');
  if (path.posix.basename(noExt).startsWith('_')) {
    return null;
  }
  return `/${noExt.replace(/\\/g, '/')}`.replace(/\/index$/, '') || '/';
}

/** Нода файла pages/: экран или обработчик API. */
function pagesNode(pattern: string, sourceFile: string, opts: DiscoverOptions, diagnostics: Diagnostic[]): AppMapNode {
  const isApi = pattern.startsWith('/api/') || pattern === '/api';
  const { path: pathExample, missing } = materializePath(pattern, opts.exampleParams);
  diagnostics.push(...missing.map(() => diag('MISSING_EXAMPLE_PARAM', { path: pattern, file: sourceFile })));
  return {
    id: isApi ? `route-handler:${pattern}` : `route:${pattern}`,
    kind: isApi ? 'route-handler' : 'page',
    title: humanTitle(pattern),
    pathPattern: pattern,
    pathExample: isApi ? pattern : pathExample,
    url: isApi ? undefined : absoluteUrl(pathExample, opts.baseUrl),
    source: { file: sourceFile },
    dynamicParams: extractDynamicParams(pattern),
    iframePolicy: { enabled: !isApi },
    metadata: { router: 'pages' },
  };
}

export function discoverPagesRouter(
  absRoot: string,
  exampleParams: ExampleParamsConfig,
  baseUrl: string | null,
  includeRouteHandlers: boolean,
): { nodes: AppMapNode[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const found = resolveRouterDir(absRoot, 'pages');
  if (!found) {
    return { nodes: [], diagnostics };
  }
  const opts = { exampleParams, baseUrl, includeRouteHandlers };
  const nodes = walkFiles(found.dir).flatMap((rel) => {
    const pattern = pagesPattern(rel, includeRouteHandlers);
    return pattern === null ? [] : [pagesNode(pattern, path.posix.join(found.rel, rel), opts, diagnostics)];
  });
  return { nodes, diagnostics };
}
