/**
 * Модель вида «API»: дерево сервис → раздел → модуль, фильтры, карточка роута
 * с входом, доступом, таблицами и экранами.
 */
import {
  apiArchitecture,
  apiCoverage,
  filterRoutes,
  routeDetail,
  shortSummary,
  type ApiCoverage,
  type ApiFilter,
  type CodeIndex,
  type RouteDetail,
  type ServiceApi,
} from '@live-app-map/graph';
import type { ApiRoute, HttpMethod, RouteInputSchema } from '@live-app-map/schema';

/** Часть входа с подписью. */
export type InputPart = {
  readonly part: 'body' | 'query' | 'params' | 'headers';
  readonly label: string;
  readonly schema: RouteInputSchema;
};

/** Карточка роута. */
export type RouteCard = RouteDetail & {
  readonly summary?: string;
  readonly inputs: readonly InputPart[];
};

const PART_LABELS: readonly { part: InputPart['part']; label: string }[] = [
  { part: 'params', label: 'Параметры пути' },
  { part: 'query', label: 'Query' },
  { part: 'body', label: 'Тело' },
  { part: 'headers', label: 'Заголовки' },
];

/** Порядок методов в фильтре. */
const METHOD_ORDER: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];

/** Состояние вида. */
export type ApiViewState = {
  readonly tree: readonly ServiceApi[];
  readonly coverage: ApiCoverage;
  /** Роуты под фильтр в порядке дерева. */
  readonly routes: readonly ApiRoute[];
  /** Методы, которые есть в карте (для фильтра). */
  readonly methods: readonly HttpMethod[];
};

/**
 * Дерево и роуты под фильтр.
 *
 * @param index - индекс кода
 * @param filter - фильтр
 * @returns состояние вида
 */
export function apiViewState(index: CodeIndex, filter: ApiFilter): ApiViewState {
  const tree = apiArchitecture(index, filter);
  const routes = tree.flatMap((s) => s.sections.flatMap((sec) => sec.modules.flatMap((m) => m.routes)));
  const present = new Set(index.code.routes.map((r) => r.method));
  return {
    tree,
    coverage: apiCoverage(index, filterRoutes(index, filter)),
    routes,
    methods: METHOD_ORDER.filter((m) => present.has(m)),
  };
}

/**
 * Карточка роута.
 *
 * @param index - индекс кода
 * @param routeId - id роута
 * @returns карточка или null
 */
export function routeCard(index: CodeIndex, routeId: string): RouteCard | null {
  const d = routeDetail(index, routeId);
  if (d === undefined) {
    return null;
  }
  const input = d.route.input;
  const inputs: InputPart[] = PART_LABELS.flatMap(({ part, label }) => {
    const schema = input?.[part];
    return schema === undefined ? [] : [{ part, label, schema }];
  });
  const summary = d.route.doc ?? d.route.comments?.join('\n\n');
  return { ...d, ...(summary === undefined ? {} : { summary }), inputs };
}

/** Однострочное описание роута для списка. */
export function routeOneLine(r: ApiRoute): string | undefined {
  return shortSummary(r.doc, r.comments);
}

/** Схема одной строкой для подсказки: `{ title: string, salary?: number }`. */
export function schemaInline(s: RouteInputSchema): string {
  if (s.fields.length === 0) {
    return s.text ?? s.name ?? '';
  }
  return `{ ${s.fields.map((f) => `${f.name}${f.optional === true ? '?' : ''}: ${f.type}`).join(', ')} }`;
}
