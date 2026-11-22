/**
 * Рёбра Next.js: переходы из литералов Link / router / redirect, обёртки layout → page.
 */
import { diag } from '@live-app-map/diagnostics';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';

/**
 * Простой extractor: next/link href="/..." и router.push('/...')
 */
export function extractEdgesFromSource(
  source: string,
  file: string,
  fromRouteId: string,
  routeIndex: Map<string, string>,
): { edges: AppMapEdge[]; diagnostics: Diagnostic[] } {
  const edges: AppMapEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const patterns: Array<{ re: RegExp; kind: AppMapEdge['kind'] }> = [
    { re: /<Link\b[^>]*\bhref=["']([^"']+)["']/g, kind: 'link' },
    { re: /href:\s*["']([^"']+)["']/g, kind: 'link' },
    { re: /router\.(push|replace)\(\s*["']([^"']+)["']/g, kind: 'push' },
    { re: /\bredirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
    { re: /\bpermanentRedirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
  ];

  for (const { re, kind } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      let href: string;
      let edgeKind = kind;
      if (kind === 'push' && m[2]) {
        href = m[2];
        edgeKind = m[1] === 'replace' ? 'replace' : 'push';
      } else {
        href = m[1] ?? '';
      }
      if (!href.startsWith('/') || href.startsWith('//')) {
        continue;
      }
      const pathOnly = href.split('?')[0]?.split('#')[0] ?? href;
      const toId = matchRoute(pathOnly, routeIndex);
      const id = `edge:${fromRouteId}->${toId ?? pathOnly}:${edgeKind}:${m.index}`;
      edges.push({
        id,
        from: fromRouteId,
        to: toId,
        kind: edgeKind,
        confidence: toId ? 'high' : 'medium',
        raw: m[0].slice(0, 80),
        label: pathOnly,
        source: { file, line: 1, column: m.index },
      });
      if (!toId) {
        diagnostics.push(
          diag('UNRESOLVED_TARGET', {
            message: `Не сопоставлен href ${pathOnly}`,
            file,
          }),
        );
      }
    }
  }
  return { edges, diagnostics };
}

/**
 * Сопоставить pathname с route id (динамические сегменты).
 */
export function matchRoute(
  pathname: string,
  routeIndex: Map<string, string>,
): string | null {
  if (routeIndex.has(pathname)) {
    return routeIndex.get(pathname) ?? null;
  }
  // try pattern match
  for (const [pattern, id] of routeIndex) {
    if (patternMatches(pattern, pathname)) {
      return id;
    }
  }
  return null;
}

export function patternMatches(pattern: string, pathname: string): boolean {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = pathname.split('/').filter(Boolean);
  // optional catch-all can be empty
  if (pParts.length === 0 && uParts.length === 0) {
    return true;
  }
  let ui = 0;
  for (let pi = 0; pi < pParts.length; pi++) {
    const p = pParts[pi] ?? '';
    if (p.startsWith('[[...') && p.endsWith(']]')) {
      return true;
    }
    if (p.startsWith('[...') && p.endsWith(']')) {
      return ui < uParts.length || true;
    }
    if (p.startsWith('[') && p.endsWith(']')) {
      if (ui >= uParts.length) {
        return false;
      }
      ui++;
      continue;
    }
    if (uParts[ui] !== p) {
      return false;
    }
    ui++;
  }
  return ui === uParts.length;
}

export function buildWrapsEdges(layouts: AppMapNode[], pages: AppMapNode[]): AppMapEdge[] {
  const edges: AppMapEdge[] = [];
  for (const page of pages) {
    // find longest layout prefix
    let best: AppMapNode | null = null;
    for (const layout of layouts) {
      const lp = layout.pathPattern;
      if (
        page.pathPattern === lp ||
        page.pathPattern.startsWith(lp === '/' ? '/' : `${lp}/`) ||
        lp === '/'
      ) {
        if (
          !best ||
          layout.pathPattern.length > best.pathPattern.length ||
          (layout.pathPattern !== '/' && best.pathPattern === '/')
        ) {
          if (lp === '/' || page.pathPattern === lp || page.pathPattern.startsWith(`${lp}/`)) {
            best = layout;
          }
        }
      }
    }
    // prefer deepest non-root if available
    const candidates = layouts.filter((layout) => {
      const lp = layout.pathPattern;
      if (lp === '/') {
        return true;
      }
      return page.pathPattern === lp || page.pathPattern.startsWith(`${lp}/`);
    });
    candidates.sort((a, b) => b.pathPattern.length - a.pathPattern.length);
    const layout = candidates[0];
    if (layout) {
      edges.push({
        id: `wraps:${layout.id}->${page.id}`,
        from: layout.id,
        to: page.id,
        kind: 'wraps',
        confidence: 'high',
        label: 'wraps',
      });
    }
  }
  return edges;
}
