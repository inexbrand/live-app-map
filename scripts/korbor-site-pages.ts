/**
 * Страницы сайта Korbor из живой CMS Payload: сайт — один catch-all Next
 * (`[[...slug]]`), поэтому экраны известны только из базы CMS.
 */
import type { AppMapDocument, AppMapEdge, AppMapNode } from '../packages/schema/src/types';

/** Страница CMS из REST Payload. */
type CmsPage = { readonly slug: string; readonly title: string };

/** Служебные slug, которые не являются отдельными экранами. */
const SKIP_SLUGS: ReadonlySet<string> = new Set(['not-found']);

/**
 * Читает опубликованные страницы CMS.
 *
 * @param baseUrl - адрес сайта (`http://localhost:16001`)
 * @returns страницы или null, если сайт не отвечает
 */
export async function fetchCmsPages(baseUrl: string): Promise<CmsPage[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/pages?limit=200&depth=0&locale=ru`, { signal: AbortSignal.timeout(60_000) });
    return res.ok ? cmsPagesOf(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Страницы из ответа REST Payload `{ docs: [{ slug, title }] }`: без slug — пропуск,
 * без title — заголовок равен slug.
 *
 * @param body - разобранный JSON ответа
 * @returns страницы (не тот формат — пусто)
 */
export function cmsPagesOf(body: unknown): CmsPage[] {
  const docs = typeof body === 'object' && body !== null && 'docs' in body && Array.isArray(body.docs) ? body.docs : [];
  return docs.flatMap((d: unknown): CmsPage[] => (typeof d === 'object' && d !== null && 'slug' in d && typeof d.slug === 'string' ? [{ slug: d.slug, title: titleOf(d, d.slug) }] : []));
}

/** Заголовок страницы или запасной slug. */
function titleOf(d: object, slug: string): string {
  return 'title' in d && typeof d.title === 'string' ? d.title : slug;
}

/**
 * Добавляет страницы CMS как экраны карты сайта; файл экрана — catch-all страница.
 *
 * @param doc - карта сайта
 * @param baseUrl - адрес сайта
 * @param pages - страницы CMS
 * @returns карта со страницами
 */
export function withCmsPages(doc: AppMapDocument, baseUrl: string, pages: readonly CmsPage[]): AppMapDocument {
  const catchAll = doc.nodes.find((n) => n.source?.file.includes('[[...slug]]') === true);
  const taken = new Set(doc.nodes.map((n) => n.pathExample ?? n.pathPattern));
  const extra: AppMapNode[] = pages
    .filter((p) => !SKIP_SLUGS.has(p.slug))
    .map((p) => ({ ...p, path: p.slug === 'home' ? '/' : `/${p.slug}` }))
    .filter((p) => !taken.has(p.path))
    .map((p) => ({
      id: `site-cms:${p.slug}`,
      kind: 'page',
      title: p.title,
      pathPattern: p.path,
      pathExample: p.path,
      url: `${baseUrl}${p.path}`,
      groupIds: ['marketing'],
      iframePolicy: { enabled: true },
      ...(catchAll?.source === undefined ? {} : { source: catchAll.source }),
    }));
  const home = doc.nodes.find((n) => n.pathPattern === '/');
  const edges = home === undefined
    ? []
    : extra.map((n): AppMapEdge => ({ id: `edge:${home.id}->${n.id}`, from: home.id, to: n.id, kind: 'link', confidence: 'medium' }));
  return { ...doc, nodes: [...doc.nodes, ...extra], edges: [...doc.edges, ...edges] };
}