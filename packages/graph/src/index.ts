/**
 * Нормализация, индекс, adjacency, query, diff графа AppMap.
 */
export * from './code-query';
export * from './api-query';
export * from './api-domains';
export * from './route-auto-doc';
export * from './docs-query';
export * from './map-diff';
import type {
  AppMapDocument,
  AppMapEdge,
  AppMapNode,
  EdgeKind,
} from '@live-app-map/schema';

export type Adjacency = {
  readonly out: readonly string[];
  readonly in: readonly string[];
};

export type GraphIndex = {
  readonly document: AppMapDocument;
  readonly nodesById: ReadonlyMap<string, AppMapNode>;
  readonly edgesById: ReadonlyMap<string, AppMapEdge>;
  readonly adjacency: ReadonlyMap<string, Adjacency>;
  readonly navigationEdges: readonly AppMapEdge[];
  readonly structureEdges: readonly AppMapEdge[];
};

const NAV_KINDS = new Set<string>([
  'link',
  'push',
  'replace',
  'redirect',
  'middleware',
  'navigation',
  'deep-link',
  'unknown',
  'back',
]);

const STRUCT_KINDS = new Set<string>(['wraps', 'parent']);

/** Ребро между известными нодами — в соседи обеих. */
function link(adj: Map<string, { out: string[]; in: string[] }>, e: AppMapEdge): void {
  const fromA = adj.get(e.from);
  const toA = e.to === null ? undefined : adj.get(e.to);
  if (fromA && toA && e.to !== null) {
    fromA.out.push(e.to);
    toA.in.push(e.from);
  }
}

/**
 * Строит индекс по документу (immutable).
 */
export function indexDocument(document: AppMapDocument): GraphIndex {
  const nodesById = new Map<string, AppMapNode>();
  for (const n of document.nodes) {
    nodesById.set(n.id, n);
  }
  const edgesById = new Map<string, AppMapEdge>();
  const adj = new Map<string, { out: string[]; in: string[] }>();
  for (const n of document.nodes) {
    adj.set(n.id, { out: [], in: [] });
  }
  const navigationEdges: AppMapEdge[] = [];
  const structureEdges: AppMapEdge[] = [];

  for (const e of document.edges) {
    edgesById.set(e.id, e);
    link(adj, e);
    if (NAV_KINDS.has(e.kind)) {
      navigationEdges.push(e);
    }
    if (STRUCT_KINDS.has(e.kind)) {
      structureEdges.push(e);
    }
  }

  const adjacency = new Map<string, Adjacency>();
  for (const [id, a] of adj) {
    adjacency.set(id, { out: [...a.out], in: [...a.in] });
  }

  return {
    document,
    nodesById,
    edgesById,
    adjacency,
    navigationEdges,
    structureEdges,
  };
}

/**
 * Соседи ноды (in ∪ out ∪ self).
 */
export function neighbors(index: GraphIndex, id: string): ReadonlySet<string> {
  const set = new Set<string>([id]);
  const a = index.adjacency.get(id);
  if (!a) {
    return set;
  }
  for (const x of a.out) {
    set.add(x);
  }
  for (const x of a.in) {
    set.add(x);
  }
  return set;
}

/**
 * Поиск по title / path / id.
 */
export function searchNodes(
  index: GraphIndex,
  query: string,
): readonly AppMapNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...index.nodesById.values()];
  }
  return [...index.nodesById.values()].filter((n) => [n.id, n.title, n.pathPattern, n.pathExample ?? '', n.url ?? ''].some((s) => s.toLowerCase().includes(q)));
}

/**
 * Фильтр рёбер по слою.
 */
export function filterEdgesByLayer(
  edges: readonly AppMapEdge[],
  layers: ReadonlySet<EdgeLayerFilter>,
): readonly AppMapEdge[] {
  return edges.filter((e) => layers.has(edgeLayer(e.kind)));
}

export type EdgeLayerFilter = 'navigation' | 'structure' | 'composition';

export function edgeLayer(kind: EdgeKind | string): EdgeLayerFilter {
  if (STRUCT_KINDS.has(kind)) {
    return 'structure';
  }
  if (kind === 'parallel' || kind === 'intercept') {
    return 'composition';
  }
  return 'navigation';
}

/**
 * Стабильная сортировка документа для golden/diff.
 */
export function sortDocument(doc: AppMapDocument): AppMapDocument {
  return {
    ...doc,
    nodes: [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...doc.edges].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * Резолв live URL для ноды.
 * Невалидный / небезопасный base → `null` (предсказуемо, без silent fallback на javascript:/data:).
 */
export function resolveNodeUrl(
  node: AppMapNode,
  baseUrl: string | null,
): string | null {
  if (node.url) {
    return isSafeUrl(node.url) ? node.url : null;
  }
  const path = node.pathExample ?? node.pathPattern;
  const own = ownUrl(path);
  if (own !== undefined) {
    return own;
  }
  return baseUrl !== null && baseUrl !== '' && path ? joinBase(path, baseUrl) : null;
}

/**
 * Путь, который сам себе адрес: http(s) — если безопасен; javascript:/data: — null.
 * Обычный путь — undefined (его кладут на адрес приложения).
 */
function ownUrl(path: string): string | null | undefined {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return isSafeUrl(path) ? path : null;
  }
  return path.startsWith('javascript:') || path.startsWith('data:') ? null : undefined;
}

/** Путь экрана на адресе приложения; небезопасный адрес — null. */
function joinBase(path: string, baseUrl: string): string | null {
  if (!isSafeUrl(baseUrl)) {
    return null;
  }
  try {
    const href = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl).href;
    return isSafeUrl(href) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Блокирует javascript:/data: и пр.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Применяет state inject к URL (query + hash).
 */
export function applyStateToUrl(
  base: string,
  inject?: {
    readonly query?: Readonly<Record<string, string>>;
    readonly hash?: string;
    readonly role?: string;
  },
): string {
  if (!inject) {
    return base;
  }
  try {
    const u = new URL(base);
    if (inject.query) {
      for (const [k, v] of Object.entries(inject.query)) {
        u.searchParams.set(k, v);
      }
    }
    if (inject.role) {
      u.searchParams.set('lam_role', inject.role);
    }
    if (inject.hash) {
      u.hash = inject.hash.startsWith('#') ? inject.hash : `#${inject.hash}`;
    }
    return u.href;
  } catch {
    return base;
  }
}
