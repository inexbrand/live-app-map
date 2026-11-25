/**
 * Домены API на холсте: вместо карточки сервиса — карточка на каждый домен роутов
 * (`auth`, `vacancies`, …) и ребро «экран → домен» на каждую пару.
 * Так видно, какой раздел API вызывает экран и какие экраны вызывают раздел.
 */
import { apiDomains, type ApiDomain } from '@live-app-map/graph';
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';

/** Приставка id ноды домена: `api-domain:auth`. */
export const API_DOMAIN_PREFIX = 'api-domain:';

/** Ноды и рёбра холста с доменами API. */
export type ApiDomainGraph = {
  readonly nodes: readonly AppMapNode[];
  readonly edges: readonly AppMapEdge[];
};

/** Общее начало путей по сегментам: `/api/v1/auth`. */
function commonPrefix(paths: readonly string[]): string {
  const split = paths.map((p) => p.split('/'));
  const first = split[0] ?? [];
  const n = first.findIndex((seg, i) => seg.startsWith(':') || split.some((s) => s[i] !== seg));
  return first.slice(0, n === -1 ? first.length : n).join('/') || '/';
}

/** Нода домена: роуты, экраны-вызывающие и общий путь. */
function domainNode(d: ApiDomain, screens: number): AppMapNode {
  return {
    id: `${API_DOMAIN_PREFIX}${d.name}`,
    kind: 'service',
    title: d.name,
    pathPattern: commonPrefix(d.routes.map((r) => r.path)),
    metadata: { apiDomain: d.name, routes: d.routes.length, screens, routeIds: d.routes.map((r) => r.id) },
  };
}

/** Id роутов из ребра вызова API. */
function routeIdsOf(e: AppMapEdge): readonly string[] {
  const ids = e.metadata?.['routeIds'];
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}

/** Пары экран → домен с роутами домена, которые экран вызывает. */
function screenDomainPairs(apiEdges: readonly AppMapEdge[], domainOf: ReadonlyMap<string, string>): Map<string, { from: string; domain: string; routes: Set<string> }> {
  const pairs = new Map<string, { from: string; domain: string; routes: Set<string> }>();
  for (const e of apiEdges) {
    for (const id of routeIdsOf(e)) {
      const domain = domainOf.get(id);
      if (domain !== undefined) {
        const key = `${e.from}->${domain}`;
        const pair = pairs.get(key) ?? { from: e.from, domain, routes: new Set<string>() };
        pairs.set(key, pair.routes.add(id) && pair);
      }
    }
  }
  return pairs;
}

/**
 * Заменяет ноды сервисов доменами API, а рёбра вызовов API — рёбрами «экран → домен».
 * Карта без роутов возвращается как есть.
 *
 * @param doc - карта
 * @returns ноды и рёбра для холста
 */
export function withApiDomains(doc: AppMapDocument): ApiDomainGraph {
  const routes = doc.code?.routes ?? [];
  if (routes.length === 0) {
    return { nodes: doc.nodes, edges: doc.edges };
  }
  const domains = apiDomains(routes);
  const domainOf = new Map(domains.flatMap((d) => d.routes.map((r): [string, string] => [r.id, d.name])));
  const pairs = [...screenDomainPairs(doc.edges.filter((e) => e.kind === 'api'), domainOf).values()];
  const screensOf = (name: string): number => pairs.filter((p) => p.domain === name).length;
  const edges: AppMapEdge[] = pairs.map((p) => ({
    id: `api:${p.from}->${API_DOMAIN_PREFIX}${p.domain}`,
    from: p.from,
    to: `${API_DOMAIN_PREFIX}${p.domain}`,
    kind: 'api',
    confidence: 'high',
    label: `${p.domain}: ${p.routes.size}`,
    metadata: { routeIds: [...p.routes] },
  }));
  return {
    nodes: [...doc.nodes.filter((n) => n.kind !== 'service'), ...domains.map((d) => domainNode(d, screensOf(d.name)))],
    edges: [...doc.edges.filter((e) => e.kind !== 'api'), ...edges],
  };
}
