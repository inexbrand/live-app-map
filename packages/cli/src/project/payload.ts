/**
 * Next-приложение с Payload CMS: сайт — один catch-all (`[[...slug]]`), поэтому его
 * страницы известны только из базы CMS, а у админки Payload (`/admin/[[...segments]]`)
 * есть известные экраны входа и коллекций.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';

/** Страница CMS из REST Payload. */
export type CmsPage = { readonly slug: string; readonly title: string };

/** Служебные slug, которые не являются отдельными экранами. */
const SKIP_SLUGS: ReadonlySet<string> = new Set(['not-found']);

/** slug главной страницы CMS. */
const HOME_SLUG = 'home';

/**
 * Приложение использует Payload: зависимость payload в package.json приложения.
 *
 * @param appDir - каталог приложения
 * @returns true — есть payload
 */
export function usesPayload(appDir: string): boolean {
  const file = path.join(appDir, 'package.json');
  if (!existsSync(file)) {
    return false;
  }
  const pkg: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return hasPayloadIn(pkg, 'dependencies') || hasPayloadIn(pkg, 'devDependencies');
}

/** В разделе зависимостей package.json есть payload. */
function hasPayloadIn(pkg: unknown, key: string): boolean {
  if (typeof pkg !== 'object' || pkg === null || !(key in pkg)) {
    return false;
  }
  const deps: unknown = Reflect.get(pkg, key);
  return typeof deps === 'object' && deps !== null && 'payload' in deps;
}

/**
 * Читает опубликованные страницы CMS (коллекция pages).
 *
 * @param baseUrl - адрес сайта
 * @returns страницы или null, если сайт не отвечает
 */
export async function fetchCmsPages(baseUrl: string): Promise<CmsPage[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/pages?limit=200&depth=0&locale=all`, { signal: AbortSignal.timeout(60_000) });
    return res.ok ? cmsPagesOf(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Заголовок страницы: строка или (локализованное поле, locale=all) первый непустой
 * перевод; заголовка нет — slug.
 */
function titleOf(d: object, slug: string): string {
  const raw: unknown = 'title' in d ? d.title : undefined;
  const values = typeof raw === 'object' && raw !== null ? Object.values(raw) : [raw];
  const title = values.find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return title ?? slug;
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

/** Путь экрана ноды. */
function pathOf(n: AppMapNode): string {
  return n.pathExample ?? n.pathPattern;
}

/** Экран Payload по пути. */
function payloadPage(id: string, title: string, p: string, baseUrl: string, source: AppMapNode['source']): AppMapNode {
  return {
    id,
    kind: 'page',
    title,
    pathPattern: p,
    pathExample: p,
    url: `${baseUrl}${p}`,
    iframePolicy: { enabled: true },
    ...(source === undefined ? {} : { source }),
  };
}

function link(from: string, to: string, label: string, confidence: 'high' | 'medium'): AppMapEdge {
  return { id: `edge:${from}->${to}`, from, to, kind: 'link', confidence, label };
}

/** Экраны админки Payload: вход и коллекции под `/admin`. */
function adminPages(doc: AppMapDocument, baseUrl: string): { nodes: AppMapNode[]; edges: AppMapEdge[] } {
  const admin = doc.nodes.find((n) => n.kind === 'page' && pathOf(n) === '/admin');
  if (admin === undefined) {
    return { nodes: [], edges: [] };
  }
  const taken = new Set(doc.nodes.map(pathOf));
  const extra = [
    payloadPage('payload:/admin/login', 'Payload: вход', '/admin/login', baseUrl, admin.source),
    payloadPage('payload:/admin/collections', 'Payload: коллекции', '/admin/collections', baseUrl, admin.source),
  ].filter((n) => !taken.has(pathOf(n)));
  return { nodes: extra, edges: extra.map((n) => link(admin.id, n.id, n.title, 'medium')) };
}

/** Страницы CMS как экраны; файл экрана — catch-all страница. */
function cmsNodes(doc: AppMapDocument, baseUrl: string, pages: readonly CmsPage[]): AppMapNode[] {
  const catchAll = doc.nodes.find((n) => n.kind === 'page' && n.pathPattern.includes('[[...'));
  const taken = new Set(doc.nodes.map(pathOf));
  return pages
    .filter((p) => !SKIP_SLUGS.has(p.slug) && p.slug !== HOME_SLUG && !taken.has(`/${p.slug}`))
    .map((p) => payloadPage(`cms:/${p.slug}`, p.title, `/${p.slug}`, baseUrl, catchAll?.source));
}

/**
 * Добавляет экраны Payload: вход и коллекции админки, страницы CMS (рёбра от главной),
 * заголовки главной и админки. Остальные ноды, кроме экранов (layout, not-found
 * catch-all), убираются: у сайта на catch-all они повторяют те же адреса.
 *
 * @param doc - карта Next-приложения после скана
 * @param baseUrl - адрес приложения
 * @param cms - страницы CMS (null — CMS не ответила, страниц нет)
 * @returns карта с экранами Payload
 */
export function withPayloadPages(doc: AppMapDocument, baseUrl: string, cms: readonly CmsPage[] | null): AppMapDocument {
  const home = doc.nodes.find((n) => n.kind === 'page' && pathOf(n) === '/');
  const homeTitle = cms?.find((p) => p.slug === HOME_SLUG)?.title;
  const nodes = doc.nodes.filter((n) => n.kind === 'page').map((n): AppMapNode => {
    if (n === home && homeTitle !== undefined) {
      return { ...n, title: homeTitle, defaultPinned: true };
    }
    return n.kind === 'page' && pathOf(n) === '/admin' ? { ...n, title: 'Payload: админка' } : n;
  });
  const admin = adminPages(doc, baseUrl);
  const pages = cmsNodes(doc, baseUrl, cms ?? []);
  const adminNode = doc.nodes.find((n) => n.kind === 'page' && pathOf(n) === '/admin');
  const fromHome = home === undefined ? [] : [
    ...(adminNode === undefined ? [] : [link(home.id, adminNode.id, 'CMS', 'high')]),
    ...pages.map((n) => link(home.id, n.id, n.title, 'medium')),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => ids.has(e.from) && e.to !== null && ids.has(e.to));
  return { ...doc, nodes: [...nodes, ...admin.nodes, ...pages], edges: [...edges, ...admin.edges, ...fromHome] };
}
