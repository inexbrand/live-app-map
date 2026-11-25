/**
 * Общая карта проекта: карты приложений сливаются в одну, у каждого приложения
 * своя группа и приставка id экранов (`miniapp:route:/feed`), сервисы бэкенда —
 * одна общая нода на всех.
 */
import type { CodeModel, DocsModel, LiveAppMapDocument, LiveAppMapEdge, LiveAppMapPage } from '@live-app-map/schema';
import type { LamLink, LamProjectConfig, LamViewport } from '@live-app-map/sdk';

/** Приложение в общей карте: id (приставка нод), подпись группы, адрес dev-сервера, карта. */
export type SurfaceMap = {
  readonly id: string;
  readonly title: string;
  readonly baseUrl: string;
  /** Размер окна экранов приложения; свой размер экрана в карте главнее. */
  readonly viewport?: LamViewport;
  /** Параметры адреса каждого экрана приложения. */
  readonly query?: Readonly<Record<string, string>>;
  readonly doc: LiveAppMapDocument;
};

/** Ноды, рёбра и группы общей карты. */
export type MergedSurfaces = {
  readonly pages: LiveAppMapPage[];
  readonly edges: LiveAppMapEdge[];
  readonly groups: { id: string; title: string; order: number }[];
};

/** Абсолютный URL экрана на адресе своего приложения (чужой хост заменяется). */
function surfaceUrl(p: LiveAppMapPage, baseUrl: string): string | undefined {
  const u = p.url === undefined || p.url === '' ? undefined : URL.parse(p.url) ?? undefined;
  const base = new URL(baseUrl);
  if (u === undefined || u.host === base.host) {
    return p.url;
  }
  const pathPart = p.path ?? u.pathname;
  return `${base.protocol}//${base.host}${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}`;
}

/** Адрес с параметрами приложения; hash маршрута остаётся. */
function withQuery(url: string | undefined, query: Readonly<Record<string, string>> | undefined): string | undefined {
  const u = url === undefined || query === undefined ? null : URL.parse(url);
  if (u === null || query === undefined) {
    return url;
  }
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return u.href;
}

/** Экран приложения в общей карте: id с приставкой, группа, исходный id в metadata. */
function surfacePage(s: SurfaceMap, p: LiveAppMapPage): LiveAppMapPage {
  return {
    ...p,
    id: `${s.id}:${p.id}`,
    group: s.id,
    url: withQuery(surfaceUrl(p, s.baseUrl), s.query),
    ...(p.viewport === undefined && s.viewport !== undefined ? { viewport: s.viewport } : {}),
    metadata: { ...p.metadata, surface: s.id, originalId: p.id, baseUrl: s.doc.baseUrl },
  };
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

/** Добавляет приложение: группа, экраны с приставкой, рёбра между своими нодами. */
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

/**
 * Сливает карты приложений; корни приложений остаются отдельными (miniapp:/, admin:/).
 *
 * @param surfaces - приложения по порядку групп
 * @returns ноды, рёбра и группы
 */
export function mergeSurfaces(surfaces: readonly SurfaceMap[]): MergedSurfaces {
  const out: MergedSurfaces = { pages: [], edges: [], groups: [] };
  for (const s of surfaces) {
    addSurface(out, s);
  }
  return out;
}

/** Экран общей карты по концу связи `<приложение>:<путь>`: шаблон пути или пример. */
function pageOfEnd(pages: readonly LiveAppMapPage[], end: string): LiveAppMapPage | undefined {
  const at = end.indexOf(':');
  const app = end.slice(0, at);
  const p = end.slice(at + 1);
  const own = pages.filter((x) => x.group === app);
  return own.find((x) => x.metadata?.['pathPattern'] === p) ?? own.find((x) => x.path === p);
}

/**
 * Добавляет связи из config.links (которых нет в коде); уже имеющаяся пара не повторяется.
 *
 * @param merged - слитые приложения
 * @param links - связи конфига
 * @returns рёбра добавлены в merged; неразрешённые концы — предупреждения
 */
export function applyLinks(merged: MergedSurfaces, links: readonly LamLink[]): string[] {
  const warnings: string[] = [];
  const seen = new Set(merged.edges.map((e) => `${e.from}->${e.to}`));
  for (const l of links) {
    const from = pageOfEnd(merged.pages, l.from);
    const to = pageOfEnd(merged.pages, l.to);
    if (from === undefined || to === undefined) {
      warnings.push(`links: нет экрана ${from === undefined ? l.from : l.to} — проверьте путь маршрута в config.links`);
      continue;
    }
    const key = `${from.id}->${to.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.edges.push({ id: `config-link:${key}`, from: from.id, to: to.id, kind: 'link', ...(l.label === undefined ? {} : { label: l.label }) });
    }
  }
  return warnings;
}

/** Версия генератора общей карты. */
export const PROJECT_GENERATOR = 'live-app-map scan --project/1.0.0';

/**
 * Документ общей карты проекта.
 *
 * @param config - конфиг проекта
 * @param merged - слитые приложения
 * @param code - code всех приложений
 * @param docs - документация репозитория
 * @param generatedAt - время сборки (ISO)
 * @returns LiveAppMap
 */
export function projectDocument(config: LamProjectConfig, merged: MergedSurfaces, code: CodeModel, docs: DocsModel, generatedAt: string): LiveAppMapDocument {
  const first = config.apps[0];
  if (first === undefined) {
    throw new Error('в конфиге проекта нет приложений');
  }
  return {
    version: '1.0',
    baseUrl: first.baseUrl,
    app: {
      name: config.name,
      platform: 'web',
      generator: PROJECT_GENERATOR,
      generatedAt,
      description: `Проект ${config.name}: ${config.apps.map((a) => a.label).join(', ')}`,
    },
    pages: merged.pages,
    edges: merged.edges,
    groups: merged.groups,
    layout: { algorithm: 'dagre', direction: 'LR' },
    code,
    docs,
    extensions: {
      project: {
        name: config.name,
        apps: Object.fromEntries(config.apps.map((a) => [a.id, a.baseUrl])),
        liveOnly: true,
      },
    },
  };
}
