/**
 * Обогащение карт Korbor поверх скана: роли мини-приложения, страницы CMS сайта,
 * общая карта всех поверхностей. Чистые функции — файлы читает и пишет scan-korbor.
 */
import type { CodeModel, LiveAppMapDocument, LiveAppMapEdge, LiveAppMapPage } from '../packages/schema/src/index';
import type { AppMapDocument, AppMapEdge, AppMapNode, AppMapPageState } from '../packages/schema/src/types';
import type { DocsModel } from '../packages/schema/src/docs-model';

const ROLE_STATES: AppMapPageState[] = [
  {
    name: 'recruiter',
    note: 'Роль рекрутера — лента, отклики, верификация',
    inject: {
      role: 'recruiter',
      query: { lam_role: 'recruiter' },
      labels: ['role', 'miniapp'],
    },
  },
  {
    name: 'employer',
    note: 'Роль клиента (employer) — создание вакансий, кабинет',
    inject: {
      role: 'employer',
      query: { lam_role: 'employer' },
      labels: ['role', 'miniapp', 'client'],
    },
  },
];

const RECRUITER_PATHS = new Set(['/feed', '/applications', '/applications/[id]/submit', '/verification', '/wallet', '/vacancies/[id]']);

/** Табы, общие для обеих ролей. */
const SHARED_TABS = new Set(['/feed', '/wallet', '/chats', '/register', '/']);

/** Порядок табов: соседние связываются рёбрами (в конфиге RR element:null — рёбер из AST мало). */
const TAB_ORDER = ['/feed', '/applications', '/wallet', '/chats', '/verification', '/employer/create', '/employer/vacancies', '/register'];

/** Роли экрана по пути: клиент, рекрутер, общий таб — обе. */
function roleNames(p: string): string[] {
  return [
    ...(p.startsWith('/employer/') ? ['employer'] : []),
    ...(RECRUITER_PATHS.has(p) || p === '/chats' || p.startsWith('/chat') ? ['recruiter'] : []),
    ...(SHARED_TABS.has(p) ? ROLE_STATES.map((s) => s.name) : []),
  ];
}

/** Экран со стейтами своих ролей (уже заданные не повторяются). */
function withRoleStates(n: AppMapNode): AppMapNode {
  if (n.kind !== 'page') {
    return n;
  }
  const states: AppMapPageState[] = [...(n.states ?? [])];
  for (const st of roleNames(n.pathPattern).flatMap((name) => ROLE_STATES.filter((s) => s.name === name))) {
    if (!states.some((s) => s.name === st.name)) {
      states.push(st);
    }
  }
  return states.length > 0 ? { ...n, states } : n;
}

/** Рёбра между соседними табами и «лента → вакансия», если таких ещё нет. */
function navEdges(nodes: readonly AppMapNode[], edges: readonly AppMapEdge[]): AppMapEdge[] {
  const byPath = new Map(nodes.flatMap((n): [string, string][] => (n.kind === 'page' ? [[n.pathExample ?? n.pathPattern, n.id]] : [])));
  const out = [...edges];
  const seen = new Set(out.map((e) => `${e.from}->${e.to}`));
  for (const e of [...tabEdges(byPath), ...vacancyEdge(byPath)]) {
    const key = `${e.from}->${e.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/** Рёбра между соседними табами, которые есть в карте. */
function tabEdges(byPath: ReadonlyMap<string, string>): AppMapEdge[] {
  return TAB_ORDER.slice(1).flatMap((p, i): AppMapEdge[] => {
    const from = byPath.get(TAB_ORDER[i] ?? '');
    const to = byPath.get(p);
    return from === undefined || to === undefined ? [] : [{ id: `edge:tab:${from}->${to}`, from, to, kind: 'link', confidence: 'medium', label: 'tab' }];
  });
}

/** «Лента → вакансия» (вакансия рекрутера, не клиента). */
function vacancyEdge(byPath: ReadonlyMap<string, string>): AppMapEdge[] {
  const feedId = byPath.get('/feed');
  const vacId = [...byPath.entries()].find(([p]) => p.startsWith('/vacancies/') && !p.includes('employer'))?.[1];
  return feedId === undefined || vacId === undefined ? [] : [{ id: `edge:${feedId}->${vacId}`, from: feedId, to: vacId, kind: 'link', confidence: 'high', label: 'Open vacancy' }];
}

/**
 * Мини-приложение: стейты ролей recruiter / employer у экранов и рёбра между табами.
 *
 * @param doc - карта после скана
 * @returns карта со стейтами, рёбрами и расширением stateInject
 */
export function enrichMiniapp(doc: AppMapDocument): AppMapDocument {
  const nodes = doc.nodes.map(withRoleStates);
  return {
    ...doc,
    nodes,
    edges: navEdges(nodes, doc.edges),
    extensions: {
      ...doc.extensions,
      stateInject: {
        roles: ['recruiter', 'employer'],
        queryParam: 'lam_role',
        description: 'Korbor miniapp: recruiter vs employer (клиент). Visualizer добавляет ?lam_role= в iframe URL.',
      },
    },
  };
}

/** Страница сайта, известная без CMS. */
function sitePage(id: string, title: string, p: string, group: string, baseUrl: string, pinned = false): AppMapNode {
  return {
    id,
    kind: 'page',
    title,
    pathPattern: p,
    pathExample: p,
    url: `${baseUrl}${p}`,
    groupIds: [group],
    ...(pinned ? { defaultPinned: true } : {}),
    iframePolicy: { enabled: true },
  };
}

/** Ребро между страницами сайта. */
function siteEdge(from: string, to: string, confidence: 'high' | 'medium', label: string): AppMapEdge {
  return { id: `edge:${from}->${to}`, from, to, kind: 'link', confidence, label };
}

/**
 * Сайт: главная и страницы Payload поверх catch-all Next; прочие ноды — только экраны.
 *
 * @param doc - карта сайта после скана
 * @param baseUrl - адрес сайта
 * @returns карта с известными страницами, рёбрами и группами
 */
export function enrichSite(doc: AppMapDocument, baseUrl: string): AppMapDocument {
  const extras: AppMapNode[] = [
    sitePage('site-home', 'Marketing Home', '/', 'marketing', baseUrl, true),
    sitePage('site-payload-admin', 'Payload Admin', '/admin', 'cms', baseUrl),
    sitePage('site-payload-login', 'Payload Login', '/admin/login', 'cms', baseUrl),
    sitePage('site-payload-collections', 'Payload Collections', '/admin/collections', 'cms', baseUrl),
  ];
  const taken = new Set(extras.map((e) => e.pathExample));
  const rest = doc.nodes.filter((n) => n.kind === 'page' && !taken.has(n.pathExample ?? n.pathPattern));
  return {
    ...doc,
    nodes: [...extras, ...rest],
    edges: [
      siteEdge('site-home', 'site-payload-admin', 'high', 'CMS'),
      siteEdge('site-payload-admin', 'site-payload-login', 'medium', 'Login'),
      siteEdge('site-payload-admin', 'site-payload-collections', 'medium', 'Collections'),
      ...doc.edges,
    ],
    groups: [
      { id: 'marketing', title: 'Marketing', color: '#3b82f6', order: 0 },
      { id: 'cms', title: 'Payload CMS', color: '#a78bfa', order: 1 },
    ],
  };
}

/** Поверхность общей карты: id (приставка нод), подпись группы, свой хост, карта. */
export type SurfaceMap = {
  readonly id: string;
  readonly title: string;
  readonly expectedHost: string;
  readonly doc: LiveAppMapDocument;
};

/** Ноды, рёбра и группы общей карты. */
export type MergedSurfaces = {
  readonly pages: LiveAppMapPage[];
  readonly edges: LiveAppMapEdge[];
  readonly groups: { id: string; title: string; order: number }[];
};

/** Разобранный URL или undefined. */
function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Абсолютный URL экрана на хосте своей поверхности (чужой хост заменяется). */
function surfaceUrl(p: LiveAppMapPage, host: string): string | undefined {
  const u = p.url === undefined || p.url === '' ? undefined : parseUrl(p.url);
  if (u === undefined || u.host === host) {
    return p.url;
  }
  const pathPart = p.path ?? u.pathname;
  const protocol = host.includes('5175') ? 'https' : 'http';
  return `${protocol}://${host}${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}`;
}

/** Экран поверхности в общей карте: id с приставкой, группа, исходный id в metadata. */
function surfacePage(s: SurfaceMap, p: LiveAppMapPage): LiveAppMapPage {
  return {
    ...p,
    id: `${s.id}:${p.id}`,
    group: s.id,
    // Поверхность видна по рамке группы на холсте — без префикса в названии.
    title: p.title,
    url: surfaceUrl(p, s.expectedHost),
    metadata: { ...p.metadata, surface: s.id, originalId: p.id, baseUrl: s.doc.baseUrl },
  };
}

/** Добавляет поверхность: сервисы — одна общая нода без приставки, экраны — с приставкой. */
function addSurface(out: MergedSurfaces, s: SurfaceMap): void {
  out.groups.push({ id: s.id, title: s.title, order: out.groups.length });
  const idMap = new Map(s.doc.pages.map((p): [string, string] => [p.id, addPage(out, s, p)]));
  for (const e of s.doc.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (from !== undefined && to !== undefined) {
      out.edges.push({ ...e, id: e.id ? `${e.id}:${s.id}` : undefined, from, to });
    }
  }
}

/** Добавляет экран (или сервис, если его ещё нет) и отдаёт его id в общей карте. */
function addPage(out: MergedSurfaces, s: SurfaceMap, p: LiveAppMapPage): string {
  const isService = p.metadata?.['kind'] === 'service';
  const page = isService ? p : surfacePage(s, p);
  if (!isService || !out.pages.some((x) => x.id === p.id)) {
    out.pages.push(page);
  }
  return page.id;
}

/** Связи сайта с корнями админки и мини-приложения (подпись, не владение корнями). */
function crossLinks(pages: readonly LiveAppMapPage[]): LiveAppMapEdge[] {
  const siteHome = pages.find((p) => p.id === 'site:site-home');
  if (siteHome === undefined) {
    return [];
  }
  const targets: [string, string][] = [
    ['admin:route:/', 'Админка'],
    ['miniapp:route:/', 'Miniapp'],
  ];
  return targets.flatMap(([id, label]): LiveAppMapEdge[] =>
    pages.some((p) => p.id === id) ? [{ from: siteHome.id, to: id, label, kind: 'link' }] : [],
  );
}

/**
 * Сливает карты поверхностей: корни продуктов остаются отдельными (miniapp:/, admin:/, site:/).
 *
 * @param surfaces - поверхности по порядку групп
 * @returns ноды, рёбра (с перекрёстными связями сайта) и группы
 */
export function mergeSurfaces(surfaces: readonly SurfaceMap[]): MergedSurfaces {
  const out: MergedSurfaces = { pages: [], edges: [], groups: [] };
  for (const s of surfaces) {
    addSurface(out, s);
  }
  out.edges.push(...crossLinks(out.pages));
  return out;
}

/**
 * Общая карта «Весь Korbor».
 *
 * @param merged - слитые поверхности
 * @param code - code всех поверхностей
 * @param docs - документация репозитория
 * @param generatedAt - время сборки (ISO)
 * @returns документ korbor-all
 */
export function korborAllDocument(merged: MergedSurfaces, code: CodeModel, docs: DocsModel, generatedAt: string): LiveAppMapDocument {
  return {
    version: '1.0',
    baseUrl: 'http://localhost:16001',
    app: {
      name: 'Korbor (все поверхности)',
      platform: 'web',
      generator: 'scan-korbor+merge/0.2.0',
      generatedAt,
      description: 'Unified live graph: miniapp + admin + site (no god-root)',
    },
    pages: merged.pages,
    edges: merged.edges,
    groups: merged.groups,
    layout: { algorithm: 'dagre', direction: 'LR' },
    code,
    docs,
    extensions: {
      korbor: {
        surfaces: {
          miniapp: 'https://vite.localhost:5175',
          admin: 'http://localhost:16002',
          site: 'http://localhost:16001',
          api: 'http://localhost:16000',
          visualizer: 'http://localhost:4310',
        },
        liveOnly: true,
      },
    },
  };
}
