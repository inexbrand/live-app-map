/**
 * Конвертация между enterprise AppMapDocument и viewer liveappmap.
 */
import type {
  AppMapDocument,
  AppMapEdge,
  AppMapNode,
  LiveAppMapDocument,
  LiveAppMapEdge,
  LiveAppMapPage,
} from './types';
import { FORMAT_VERSION } from './types';

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
 * Enterprise document → viewer liveappmap (pages/edges).
 */
export function appMapToLiveAppMap(doc: AppMapDocument): LiveAppMapDocument {
  const pages: LiveAppMapPage[] = doc.nodes
    .filter((n) => n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external')
    .map((n) => nodeToPage(n));

  const edges: LiveAppMapEdge[] = doc.edges
    .filter((e) => e.to !== null)
    .filter((e) => isNavigationEdge(e.kind))
    .map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to as string,
      label: e.label,
      kind: e.kind,
      raw: e.raw,
      metadata: e.metadata,
    }));

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

function isNavigationEdge(kind: string): boolean {
  return (
    kind === 'link' ||
    kind === 'push' ||
    kind === 'replace' ||
    kind === 'redirect' ||
    kind === 'navigation' ||
    kind === 'middleware' ||
    kind === 'deep-link' ||
    kind === 'unknown'
  );
}

/**
 * Viewer liveappmap → enterprise AppMapDocument.
 */
export function liveAppMapToAppMap(doc: LiveAppMapDocument): AppMapDocument {
  const nodes: AppMapNode[] = doc.pages.map((p) => pageToNode(p, doc.baseUrl));
  const edges: AppMapEdge[] = doc.edges.map((e, i) => ({
    id: e.id ?? `${e.from}->${e.to}#${i}`,
    from: e.from,
    to: e.to,
    kind: (e.kind as AppMapEdge['kind']) ?? 'link',
    confidence: 'high' as const,
    label: e.label,
    raw: e.raw,
    metadata: e.metadata,
  }));

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
