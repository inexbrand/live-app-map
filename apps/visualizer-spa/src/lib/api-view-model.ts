/**
 * Модель вида «API»: домены роутов, фильтры и доска роута — вход, ответ, доступ,
 * таблицы с колонками, что роут меняет, экраны.
 */
import {
  apiCoverage,
  apiDomains,
  filterRoutes,
  routeAutoDoc,
  routeDetail,
  routeScreenGap,
  shortSummary,
  type ApiCoverage,
  type ApiDomain,
  type ApiFilter,
  type CodeIndex,
  type RouteAutoDoc,
  type RouteDetail,
  type ScreenGap,
  type TableTouch,
} from '@live-app-map/graph';
import type { ApiRoute, DbColumn, DbOperation, HttpMethod, RouteInputSchema } from '@live-app-map/schema';

/** Часть входа с подписью. */
export type InputPart = {
  readonly part: 'body' | 'query' | 'params' | 'headers';
  readonly label: string;
  readonly schema: RouteInputSchema;
};

/** Карточка роута. */
export type RouteCard = RouteDetail & {
  /** Авторское описание (JSDoc, комментарии). */
  readonly summary?: string;
  /** Описание, собранное из кода. */
  readonly auto: RouteAutoDoc;
  /** Почему роут не вызывает ни один экран; нет — экраны есть. */
  readonly gap?: ScreenGap;
  readonly inputs: readonly InputPart[];
  /** Домен роута. */
  readonly domain: string;
  /** Параметры пути без схемы: `:id` из пути, которых нет в схеме params. */
  readonly pathParams: readonly string[];
  /** Что роут меняет в БД: по виду операции. */
  readonly effects: readonly RouteEffect[];
  /** Таблицы роута с колонками. */
  readonly tables: readonly BoardTable[];
};

/** Изменение данных: действие и таблицы. */
export type RouteEffect = { readonly label: string; readonly tables: readonly string[] };

/** Таблица на доске роута: обращение, чтение или запись, колонки из схемы. */
export type BoardTable = {
  readonly touch: TableTouch;
  readonly mode: 'read' | 'write';
  /** Колонки; таблицы нет в схеме — пусто. */
  readonly columns: readonly DbColumn[];
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
  /** Домены роутов под фильтр. */
  readonly domains: readonly ApiDomain[];
  readonly coverage: ApiCoverage;
  /** Роуты под фильтр в порядке доменов. */
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
  const filtered = filterRoutes(index, filter);
  const domains = apiDomains(filtered, index.code.routes);
  const routes = domains.flatMap((d) => d.routes);
  const present = new Set(index.code.routes.map((r) => r.method));
  return {
    domains,
    coverage: apiCoverage(index, filtered),
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
  const gap = routeScreenGap(index, d.route);
  const domain = apiDomains([d.route], index.code.routes)[0]?.name ?? '/';
  return {
    ...d,
    ...(summary === undefined ? {} : { summary }),
    auto: routeAutoDoc(index, d.route),
    ...(gap === undefined ? {} : { gap }),
    inputs,
    domain,
    pathParams: pathParamsWithoutSchema(d.route),
    effects: routeEffects(d.writes),
    tables: [
      ...d.reads.map((touch): BoardTable => ({ touch, mode: 'read', columns: index.tablesByExport.get(touch.table)?.columns ?? [] })),
      ...d.writes.map((touch): BoardTable => ({ touch, mode: 'write', columns: index.tablesByExport.get(touch.table)?.columns ?? [] })),
    ],
  };
}

/** Параметры пути (`:id`, `:userId`), которых нет в схеме params. */
function pathParamsWithoutSchema(r: ApiRoute): string[] {
  const known = new Set(r.input?.params?.fields.map((f) => f.name) ?? []);
  return r.path
    .split('/')
    .filter((s) => s.startsWith(':'))
    .map((s) => s.slice(1).replace(/\?$/, ''))
    .filter((p) => !known.has(p));
}

/** Подписи изменений по операции записи. */
const EFFECT_LABELS: readonly { readonly op: DbOperation; readonly label: string }[] = [
  { op: 'insert', label: 'Добавляет строки' },
  { op: 'upsert', label: 'Добавляет или обновляет' },
  { op: 'update', label: 'Обновляет' },
  { op: 'delete', label: 'Удаляет' },
];

/**
 * Что роут меняет в БД: действие → таблицы (имя в БД, иначе в коде).
 *
 * @param writes - таблицы на запись
 * @returns изменения в порядке insert, upsert, update, delete; без записи — пусто
 */
export function routeEffects(writes: readonly TableTouch[]): RouteEffect[] {
  return EFFECT_LABELS.flatMap(({ op, label }) => {
    const tables = writes.filter((w) => w.operations.includes(op)).map((w) => w.dbName ?? w.table);
    return tables.length === 0 ? [] : [{ label, tables }];
  });
}

/** Строка описания в списке: авторская или собранная из кода. */
export type RouteLine = { readonly text: string; readonly auto: boolean };

/** Однострочное описание роута для списка: авторское, иначе собранное из кода. */
export function routeOneLine(index: CodeIndex, r: ApiRoute): RouteLine {
  const own = shortSummary(r.doc, r.comments);
  return own === undefined ? { text: routeAutoDoc(index, r).summary, auto: true } : { text: own, auto: false };
}

/** Схема одной строкой для подсказки: `{ title: string, salary?: number }`. */
export function schemaInline(s: RouteInputSchema): string {
  if (s.fields.length === 0) {
    return s.text ?? s.name ?? '';
  }
  return `{ ${s.fields.map((f) => `${f.name}${f.optional === true ? '?' : ''}: ${f.type}`).join(', ')} }`;
}
