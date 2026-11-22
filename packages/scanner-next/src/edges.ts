/**
 * Рёбра Next.js: переходы из литералов Link / router / redirect, обёртки layout → page.
 */
import { diag } from '@live-app-map/diagnostics';
import type { AppMapEdge, AppMapNode, Diagnostic } from '@live-app-map/schema';

type EdgePattern = { readonly re: RegExp; readonly kind: AppMapEdge['kind'] };

const EDGE_PATTERNS: readonly EdgePattern[] = [
  { re: /<Link\b[^>]*\bhref=["']([^"']+)["']/g, kind: 'link' },
  { re: /href:\s*["']([^"']+)["']/g, kind: 'link' },
  { re: /router\.(push|replace)\(\s*["']([^"']+)["']/g, kind: 'push' },
  { re: /\bredirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
  { re: /\bpermanentRedirect\(\s*["']([^"']+)["']/g, kind: 'redirect' },
];

/** Адрес и вид перехода из совпадения: у router.push/replace метод — во второй группе. */
function hrefOf(m: RegExpExecArray, kind: AppMapEdge['kind']): { readonly href: string; readonly kind: AppMapEdge['kind'] } {
  if (kind === 'push' && m[2]) {
    return { href: m[2], kind: m[1] === 'replace' ? 'replace' : 'push' };
  }
  return { href: m[1] ?? '', kind };
}

/** Внутренний адрес: с одного «/», не протокол-относительный. */
function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

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
  for (const { re, kind } of EDGE_PATTERNS) {
    for (const m of source.matchAll(re)) {
      const target = hrefOf(m, kind);
      if (!isInternalHref(target.href)) {
        continue;
      }
      const pathOnly = target.href.split('?')[0]?.split('#')[0] ?? target.href;
      const toId = matchRoute(pathOnly, routeIndex);
      edges.push({
        id: `edge:${fromRouteId}->${toId ?? pathOnly}:${target.kind}:${m.index}`,
        from: fromRouteId,
        to: toId,
        kind: target.kind,
        confidence: toId ? 'high' : 'medium',
        raw: m[0].slice(0, 80),
        label: pathOnly,
        source: { file, line: 1, column: m.index },
      });
      if (!toId) {
        diagnostics.push(diag('UNRESOLVED_TARGET', { message: `Не сопоставлен href ${pathOnly}`, file }));
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

/** Сегмент «остаток пути»: [...slug] или [[...slug]] — дальше совпадает всё. */
function isRestSegment(p: string): boolean {
  return (p.startsWith('[[...') && p.endsWith(']]')) || (p.startsWith('[...') && p.endsWith(']'));
}

/**
 * Совпадает ли адрес с шаблоном Next: [id] — один любой сегмент, catch-all — любой остаток.
 *
 * @param pattern - шаблон пути
 * @param pathname - адрес без query и hash
 */
export function patternMatches(pattern: string, pathname: string): boolean {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = pathname.split('/').filter(Boolean);
  for (const [i, p] of pParts.entries()) {
    if (isRestSegment(p)) {
      return true;
    }
    const dynamic = p.startsWith('[') && p.endsWith(']');
    if (i >= uParts.length || (!dynamic && uParts[i] !== p)) {
      return false;
    }
  }
  return pParts.length === uParts.length;
}

/** Шаблон page лежит под макетом: корень, тот же путь или вложенный. */
function isUnderLayout(pagePattern: string, layoutPattern: string): boolean {
  return layoutPattern === '/' || pagePattern === layoutPattern || pagePattern.startsWith(`${layoutPattern}/`);
}

/**
 * Рёбра «макет оборачивает страницу»: у каждой страницы — самый глубокий макет над ней.
 *
 * @param layouts - макеты App Router
 * @param pages - страницы
 */
export function buildWrapsEdges(layouts: AppMapNode[], pages: AppMapNode[]): AppMapEdge[] {
  return pages.flatMap((page) => {
    const layout = layouts
      .filter((l) => isUnderLayout(page.pathPattern, l.pathPattern))
      .sort((a, b) => b.pathPattern.length - a.pathPattern.length)[0];
    return layout === undefined
      ? []
      : [{ id: `wraps:${layout.id}->${page.id}`, from: layout.id, to: page.id, kind: 'wraps', confidence: 'high', label: 'wraps' }];
  });
}
