/**
 * Архитектура API из раздела `code`: сервисы → разделы (первый сегмент пути после
 * `/api/vN`) → модули (второй сегмент) → роуты; фильтры вида «API» и MCP.
 */
import type { ApiRoute, CodeService, HttpMethod } from '@live-app-map/schema';
import type { CodeIndex } from './code-query';
import { routeAutoDoc, routeScreenGap } from './route-auto-doc';

/** Фильтр роутов. */
export type ApiFilter = {
  /** Подстрока метода, пути, описания, обработчика или файла. */
  readonly query?: string;
  /** Методы; пусто — любые. */
  readonly methods?: readonly HttpMethod[];
  /** Сервис: имя или id. */
  readonly service?: string;
  /** Таблица, которую роут читает или пишет: имя в коде или в БД. */
  readonly table?: string;
  /** Только роуты без авторского описания. */
  readonly undocumented?: boolean;
  /** Только роуты, которые не вызывает ни один экран. */
  readonly noScreens?: boolean;
};

/** Модуль: роуты с общим префиксом из двух сегментов. */
export type ApiModule = {
  /** Префикс: `/api/v1/admin/vacancies`. */
  readonly prefix: string;
  /** Имя модуля: второй сегмент или раздел, если второго нет. */
  readonly name: string;
  readonly routes: readonly ApiRoute[];
};

/** Раздел: роуты с общим первым сегментом. */
export type ApiSection = {
  /** Префикс раздела: `/api/v1/admin`. */
  readonly prefix: string;
  readonly name: string;
  readonly modules: readonly ApiModule[];
  readonly count: number;
};

/** Сервис с разделами. */
export type ServiceApi = {
  readonly service: CodeService;
  readonly sections: readonly ApiSection[];
  readonly count: number;
};

/** Ключ группировки пути. */
export type RouteGroupKey = {
  /** Общая часть: `/api/v1`. */
  readonly base: string;
  readonly section: string;
  readonly module: string;
};

const VERSION = /^v\d+$/;

/**
 * Раздел и модуль пути: `/api/v1/admin/vacancies/:id` → base `/api/v1`,
 * раздел `admin`, модуль `vacancies`. Параметры (`:id`) группу не образуют.
 *
 * @param routePath - путь роута
 * @returns ключ группы
 */
export function routeGroupKey(routePath: string): RouteGroupKey {
  const segs = routePath.split('/').filter((s) => s !== '');
  const base = baseSegments(segs);
  const section = staticOr(segs[base.length]);
  const module = section !== '' ? staticOr(segs[base.length + 1]) : '';
  return { base: base.length === 0 ? '' : `/${base.join('/')}`, section, module };
}

/** Начало пути: `api`, затем версия `v1` — каждое по отдельности необязательно. */
function baseSegments(segs: readonly string[]): string[] {
  const base: string[] = [];
  if (segs[0] === 'api') {
    base.push('api');
  }
  const version = segs[base.length];
  if (version !== undefined && VERSION.test(version)) {
    base.push(version);
  }
  return base;
}

/** Статичный сегмент как есть; параметр (`:id`, `*`) и отсутствие — пустая строка. */
function staticOr(s: string | undefined): string {
  return s !== undefined && !s.startsWith(':') && !s.startsWith('*') ? s : '';
}

/** Есть описание: JSDoc или комментарий. */
export function hasDescription(r: ApiRoute): boolean {
  return r.doc !== undefined || (r.comments?.length ?? 0) > 0;
}

/** Таблицы роута по имени в коде и в БД. */
function touchesTable(index: CodeIndex, r: ApiRoute, table: string): boolean {
  const t = table.toLowerCase();
  return r.dbCalls.some((c) => c.table.toLowerCase() === t || index.tablesByExport.get(c.table)?.name.toLowerCase() === t);
}

/**
 * Роуты под фильтр в порядке карты.
 *
 * @param index - индекс кода
 * @param filter - фильтр
 * @returns роуты
 */
export function filterRoutes(index: CodeIndex, filter: ApiFilter): ApiRoute[] {
  const service = filter.service === undefined || filter.service === '' ? null : serviceByIdOrName(index, filter.service);
  if (service === undefined) {
    return [];
  }
  const checks = routeChecks(index, filter, service);
  return index.code.routes.filter((r) => checks.every((ok) => ok(r)));
}

/** Сервис по id или имени; не нашёлся — undefined. */
function serviceByIdOrName(index: CodeIndex, key: string): CodeService | undefined {
  return index.servicesById.get(key) ?? index.code.services.find((s) => s.name === key);
}

/** Текст роута для поиска (нижний регистр). */
function routeText(r: ApiRoute): string {
  return [r.method, r.path, r.doc ?? '', ...(r.comments ?? []), r.handler.name ?? '', r.location.file].join('\n').toLowerCase();
}

/** Проверки фильтра: только заданные поля. */
function routeChecks(index: CodeIndex, filter: ApiFilter, service: CodeService | null): ((r: ApiRoute) => boolean)[] {
  const { methods, table, query } = filterValues(filter);
  const all: [boolean, (r: ApiRoute) => boolean][] = [
    [service !== null, (r) => r.serviceId === service?.id],
    [methods.size > 0, (r) => methods.has(r.method)],
    [table !== '', (r) => touchesTable(index, r, table)],
    [filter.undocumented === true, (r) => !hasDescription(r)],
    [filter.noScreens === true, (r) => !hasScreens(index, r)],
    [query !== '', (r) => routeText(r).includes(query)],
  ];
  return all.filter(([on]) => on).map(([, check]) => check);
}

/** Поля фильтра без пустых значений: методы, таблица, запрос в нижнем регистре. */
function filterValues(filter: ApiFilter): { readonly methods: ReadonlySet<string>; readonly table: string; readonly query: string } {
  return { methods: new Set(filter.methods ?? []), table: filter.table ?? '', query: filter.query?.trim().toLowerCase() ?? '' };
}

function hasScreens(index: CodeIndex, r: ApiRoute): boolean {
  return (index.callersByRoute.get(r.id)?.length ?? 0) > 0;
}

/** Группирует по ключу, сохраняя порядок первого появления. */
function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}

const byPath = (a: ApiRoute, b: ApiRoute): number => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path));

/** Префикс из частей. */
function prefixOf(base: string, ...parts: string[]): string {
  return [base, ...parts.filter((p) => p !== '')].join('/').replace(/\/{2,}/g, '/') || '/';
}

/**
 * Архитектура API: сервисы с разделами и модулями; пустые сервисы не входят.
 *
 * @param index - индекс кода
 * @param filter - фильтр роутов
 * @returns сервисы по числу роутов
 */
export function apiArchitecture(index: CodeIndex, filter: ApiFilter = {}): ServiceApi[] {
  const routes = filterRoutes(index, filter);
  const out: ServiceApi[] = [];
  for (const [serviceId, list] of groupBy(routes, (r) => r.serviceId)) {
    const service = index.servicesById.get(serviceId) ?? { id: serviceId, name: serviceId, root: '.' };
    const sections = [...groupBy(list, (r) => {
      const k = routeGroupKey(r.path);
      return `${k.base}|${k.section}`;
    })].map(([key, rs]): ApiSection => {
      const [base = '', section = ''] = key.split('|');
      const modules = [...groupBy(rs, (r) => routeGroupKey(r.path).module)].map(
        ([module, mr]): ApiModule => ({
          prefix: prefixOf(base, section, module),
          name: module === '' ? section || '/' : module,
          routes: [...mr].sort(byPath),
        }),
      );
      return {
        prefix: prefixOf(base, section),
        name: section || '/',
        modules: modules.sort((a, b) => a.prefix.localeCompare(b.prefix)),
        count: rs.length,
      };
    });
    out.push({ service, sections: sections.sort((a, b) => a.prefix.localeCompare(b.prefix)), count: list.length });
  }
  return out.sort((a, b) => b.count - a.count || a.service.name.localeCompare(b.service.name));
}

/** Сводка покрытия роутов: описания, проверки входа, доступ. */
export type ApiCoverage = {
  readonly routes: number;
  /** С авторским описанием (JSDoc или комментарий). */
  readonly described: number;
  /** С описанием из кода: найден хотя бы один факт кроме обработчика. */
  readonly autoDescribed: number;
  readonly withInput: number;
  readonly withAccess: number;
  readonly withScreens: number;
  /** Без экранов — по причинам. */
  readonly gaps: { readonly unreached: number; readonly otherClient: number; readonly noCaller: number };
};

/**
 * Покрытие роутов.
 *
 * @param index - индекс кода
 * @param routes - роуты (по умолчанию все)
 * @returns счётчики
 */
export function apiCoverage(index: CodeIndex, routes: readonly ApiRoute[] = index.code.routes): ApiCoverage {
  const gaps = routes.map((r) => routeScreenGap(index, r)?.kind);
  return {
    routes: routes.length,
    described: routes.filter(hasDescription).length,
    autoDescribed: routes.filter((r) => routeAutoDoc(index, r).facts > 0).length,
    withInput: routes.filter((r) => r.input !== undefined).length,
    withAccess: routes.filter((r) => r.access !== undefined).length,
    withScreens: routes.filter((r) => (index.callersByRoute.get(r.id)?.length ?? 0) > 0).length,
    gaps: {
      unreached: gaps.filter((g) => g === 'unreached').length,
      otherClient: gaps.filter((g) => g === 'other-client').length,
      noCaller: gaps.filter((g) => g === 'no-caller').length,
    },
  };
}
