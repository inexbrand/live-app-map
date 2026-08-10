/**
 * Конвертация между enterprise AppMapDocument и viewer liveappmap.
 */
import type {
  AppMapDocument,
  AppMapEdge,
  AppMapNode,
  EdgeKind,
  LiveAppMapDocument,
  LiveAppMapEdge,
  LiveAppMapPage,
} from './types';
import { FORMAT_VERSION } from './types';

/** Канонический набор EdgeKind для runtime-сужения на границе. */
const EDGE_KIND_SET: ReadonlySet<string> = new Set<EdgeKind>([
  'link',
  'push',
  'replace',
  'redirect',
  'middleware',
  'wraps',
  'parallel',
  'intercept',
  'parent',
  'unknown',
  'navigation',
  'deep-link',
  'back',
]);

/** Виды рёбер, попадающие в viewer (навигация, не structure/composition). */
const NAVIGATION_EDGE_KIND_SET: ReadonlySet<string> = new Set<string>([
  'link',
  'push',
  'replace',
  'redirect',
  'navigation',
  'middleware',
  'deep-link',
  'unknown',
]);

/** Дефолт kind при отсутствии/невалидном значении во viewer-документе. */
const DEFAULT_EDGE_KIND: EdgeKind = 'unknown';

function stableHash(parts: readonly string[]): string {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Type guard: строка — валидный EdgeKind.
 */
export function isEdgeKind(value: string): value is EdgeKind {
  return EDGE_KIND_SET.has(value);
}

/**
 * Type guard: kind — навигационный (попадает в liveappmap).
 */
export function isNavigationEdgeKind(kind: string): boolean {
  return NAVIGATION_EDGE_KIND_SET.has(kind);
}

/**
 * Сужение optional/unknown kind viewer → EdgeKind с типизированным дефолтом.
 * Невалидные значения не кастуются — подставляется DEFAULT_EDGE_KIND.
 */
export function coerceEdgeKind(kind: string | undefined): EdgeKind {
  if (kind === undefined || kind.length === 0) {
    return DEFAULT_EDGE_KIND;
  }
  if (isEdgeKind(kind)) {
    return kind;
  }
  return DEFAULT_EDGE_KIND;
}

/**
 * Ребро enterprise с разрешённым `to` (не null).
 */
type AppMapEdgeWithTarget = AppMapEdge & { readonly to: string };

/**
 * Type guard: ребро с non-null target и навигационным kind (для viewer).
 */
function isLiveNavigableEdge(e: AppMapEdge): e is AppMapEdgeWithTarget {
  return e.to !== null && isNavigationEdgeKind(e.kind);
}

/**
 * Enterprise document → viewer liveappmap (pages/edges).
 * Рёбра без target или с non-navigation kind отбрасываются.
 */
export function appMapToLiveAppMap(doc: AppMapDocument): LiveAppMapDocument {
  const pages: LiveAppMapPage[] = doc.nodes
    .filter((n) => n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external')
    .map((n) => nodeToPage(n));

  const edges: LiveAppMapEdge[] = doc.edges
    .filter(isLiveNavigableEdge)
    .map((e) => appEdgeToLiveEdge(e));

  return {
    version: '1.0',
    baseUrl: doc.baseUrl ?? undefined,
    app: {
      name: doc.project.name,
      platform: 'web',
      generator: `${doc.generator.name}/${doc.generator.version}`,
      generatedAt: doc.generatedAt,
    },
    pages,
    edges,
    groups: doc.groups,
    layout: doc.layout,
    extensions: {
      ...doc.extensions,
      liveAppMap: {
        formatVersion: doc.formatVersion,
        revision: doc.revision,
        framework: doc.project.framework,
      },
    },
  };
}

/**
 * Enterprise edge → live edge (только после isLiveNavigableEdge).
 */
function appEdgeToLiveEdge(e: AppMapEdgeWithTarget): LiveAppMapEdge {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    label: e.label,
    kind: e.kind,
    raw: e.raw,
    metadata: e.metadata,
  };
}

function nodeToPage(n: AppMapNode): LiveAppMapPage {
  return {
    id: n.id,
    title: n.title,
    path: n.pathExample ?? n.pathPattern,
    url: n.url,
    group: n.groupIds?.[0],
    type: n.kind === 'external' ? 'external' : n.presentation === 'modal' ? 'modal' : 'route',
    states: n.states,
    screenshot: n.screenshot,
    metadata: {
      ...n.metadata,
      pathPattern: n.pathPattern,
      kind: n.kind,
      sourceFile: n.source?.file,
      tags: n.tags,
    },
    position: n.position,
    iframeDisabled: n.iframePolicy ? !n.iframePolicy.enabled : false,
    defaultPinned: n.defaultPinned,
  };
}

/**
 * Viewer liveappmap → enterprise AppMapDocument.
 * kind сужается через coerceEdgeKind (дефолт unknown, без `as`).
 */
export function liveAppMapToAppMap(doc: LiveAppMapDocument): AppMapDocument {
  const nodes: AppMapNode[] = doc.pages.map((p) => pageToNode(p, doc.baseUrl));
  const edges: AppMapEdge[] = doc.edges.map((e, i) => liveEdgeToAppEdge(e, i));

  const revision = stableHash([
    ...nodes.map((n) => n.id),
    ...edges.map((e) => e.id),
    doc.baseUrl ?? '',
  ]);

  return {
    formatVersion: FORMAT_VERSION,
    kind: 'live-app-map',
    generatedAt: doc.app?.generatedAt ?? new Date().toISOString(),
    generator: {
      name: doc.app?.generator ?? 'liveappmap-import',
      version: '0.1.0',
    },
    revision,
    project: {
      name: doc.app?.name,
      root: '.',
      framework: 'manual',
    },
    baseUrl: doc.baseUrl ?? null,
    nodes,
    edges,
    groups: doc.groups,
    layout: doc.layout,
    extensions: doc.extensions,
  };
}

/**
 * Live edge → enterprise edge с типизированным kind.
 */
function liveEdgeToAppEdge(e: LiveAppMapEdge, index: number): AppMapEdge {
  return {
    id: e.id ?? `${e.from}->${e.to}#${index}`,
    from: e.from,
    to: e.to,
    kind: coerceEdgeKind(e.kind),
    confidence: 'high',
    label: e.label,
    raw: e.raw,
    metadata: e.metadata,
  };
}

function pageToNode(p: LiveAppMapPage, baseUrl?: string): AppMapNode {
  const pathPattern =
    p.path ??
    (p.url && baseUrl ? stripBase(p.url, baseUrl) : p.url) ??
    `/${p.id}`;
  const enabled = !p.iframeDisabled;
  return {
    id: p.id,
    kind: p.type === 'external' ? 'external' : 'page',
    title: p.title,
    pathPattern,
    pathExample: p.path,
    url: p.url,
    groupIds: p.group ? [p.group] : undefined,
    metadata: p.metadata,
    position: p.position,
    states: p.states,
    defaultPinned: p.defaultPinned,
    screenshot: p.screenshot,
    iframePolicy: {
      enabled,
      reason: enabled ? undefined : 'iframeDisabled in source',
    },
    presentation: p.type === 'modal' ? 'modal' : 'page',
  };
}

function stripBase(url: string, baseUrl: string): string {
  if (url.startsWith(baseUrl)) {
    const rest = url.slice(baseUrl.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
