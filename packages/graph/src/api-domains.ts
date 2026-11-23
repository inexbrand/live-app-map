/**
 * Домены API: роуты по предметной области, а не по сервису или аудитории.
 *
 * Путь `/api/v1/admin/vacancies/:id` и `/api/v1/recruiter/vacancies` — один домен
 * «vacancies». Раздел-аудитория (admin, employer, recruiter) узнаётся по данным:
 * хотя бы два его модуля встречаются модулями в других разделах. Иначе домен — сам раздел.
 */
import type { ApiRoute } from '@live-app-map/schema';
import { routeGroupKey } from './api-query';

/** Домен: имя и его роуты по пути. */
export type ApiDomain = {
  readonly name: string;
  readonly routes: readonly ApiRoute[];
};

/** Сколько общих модулей с другими разделами делает раздел аудиторией. */
const AUDIENCE_SHARED = 2;

/** Разделы-аудитории: не меньше двух их модулей есть модулями в других разделах. */
function audienceSections(routes: readonly ApiRoute[]): ReadonlySet<string> {
  const modulesBySection = new Map<string, Set<string>>();
  for (const r of routes) {
    const k = routeGroupKey(r.path);
    if (k.section !== '' && k.module !== '') {
      modulesBySection.set(k.section, (modulesBySection.get(k.section) ?? new Set()).add(k.module));
    }
  }
  const elsewhere = (section: string, module: string): boolean => [...modulesBySection].some(([s, ms]) => s !== section && ms.has(module));
  return new Set(
    [...modulesBySection].filter(([s, ms]) => [...ms].filter((m) => elsewhere(s, m)).length >= AUDIENCE_SHARED).map(([s]) => s),
  );
}

/**
 * Домен роута: модуль под разделом-аудиторией, иначе раздел; корень — «/».
 *
 * @param r - роут
 * @param audiences - разделы-аудитории
 * @returns имя домена
 */
function domainOf(r: ApiRoute, audiences: ReadonlySet<string>): string {
  const k = routeGroupKey(r.path);
  if (audiences.has(k.section) && k.module !== '') {
    return k.module;
  }
  return k.section === '' ? '/' : k.section;
}

/**
 * Домены роутов по имени; внутри — по пути и методу.
 *
 * @param routes - роуты (уже отфильтрованные)
 * @param all - все роуты карты: по ним узнаются аудитории, чтобы фильтр не менял домены
 * @returns домены по алфавиту
 */
export function apiDomains(routes: readonly ApiRoute[], all: readonly ApiRoute[] = routes): ApiDomain[] {
  const audiences = audienceSections(all);
  const byName = new Map<string, ApiRoute[]>();
  for (const r of routes) {
    const name = domainOf(r, audiences);
    byName.set(name, [...(byName.get(name) ?? []), r]);
  }
  const byPath = (a: ApiRoute, b: ApiRoute): number => a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
  return [...byName]
    .map(([name, rs]) => ({ name, routes: [...rs].sort(byPath) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
