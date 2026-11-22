/**
 * MCP tools базы знаний по коду: сервисы, роуты, таблицы, связи и экраны.
 * Читают раздел `code` карты (собирается `scan --code-dir`).
 */
import {
  AUTO_DOC_NOTE,
  apiArchitecture,
  apiCoverage,
  filterRoutes,
  findRoutes,
  findService,
  findTable,
  routeAutoDoc,
  routeDetail,
  routeScreenGap,
  serviceSummaries,
  shortSummary,
  tableDetail,
  type ApiFilter,
  type CodeIndex,
} from '@live-app-map/graph';
import type { ApiRoute, DbTable, HttpMethod } from '@live-app-map/schema';
import { loadCodeIndex } from './map-tools';
import { fail, mapPathParam, ok, requiredStr, str, type Tool, type ToolArgs as Args, type ToolResult } from './tool-kit';

const mapPath = mapPathParam('Путь к карте с разделом code, например maps/korbor-all.liveappmap.json');
const mapPathProp = mapPath.prop;

/** Каталог tools базы знаний. */
export const CODE_TOOLS: readonly Tool[] = [
  {
    name: 'list_services',
    handler: (args) => ok({ ok: true, services: serviceSummaries(indexOf(args)) }),
    description: 'Сервисы проекта (пакеты монорепо) с числом HTTP-роутов, таблиц БД и символов',
    inputSchema: { type: 'object', required: ['mapPath'], properties: { mapPath: mapPathProp } },
  },
  {
    name: 'list_routes',
    handler: listRoutes,
    description:
      'HTTP-роуты: у какого сервиса какие роуты, кратко что делает каждый и какие таблицы читает/пишет. Фильтр по сервису и подстроке',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: {
        mapPath: mapPathProp,
        service: { type: 'string', description: 'Имя сервиса (@korbor/api) или id' },
        query: { type: 'string', description: 'Подстрока метода, пути или описания' },
      },
    },
  },
  {
    name: 'get_route',
    handler: getRoute,
    description:
      'Роут целиком: авторское описание (комментарии) и описание, собранное из кода (вход, таблицы, доступ, ответ), где обработчик, какие таблицы читает и пишет (с признаком N+1), какие экраны его вызывают, а если ни один — почему',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'route'],
      properties: { mapPath: mapPathProp, route: { type: 'string', description: 'id роута или «GET /api/v1/…»' } },
    },
  },
  {
    name: 'describe_api',
    handler: describeApi,
    description:
      'Архитектура API: сервисы → разделы (/api/v1/admin) → модули (/api/v1/admin/vacancies) с роутами; у роута — авторское описание и описание из кода; покрытие описаниями, проверкой входа, доступом и экранами (без экранов — по причинам). Фильтр по сервису, методу, таблице, «без описания» (авторского), «без экранов»',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: {
        mapPath: mapPathProp,
        service: { type: 'string', description: 'Имя сервиса (@korbor/api) или id' },
        method: { type: 'string', description: 'HTTP-метод: GET, POST …' },
        table: { type: 'string', description: 'Только роуты, которые читают или пишут таблицу' },
        undocumented: { type: 'boolean', description: 'Только роуты без авторского описания' },
        noScreens: { type: 'boolean', description: 'Только роуты, которые не вызывает ни один экран, с причиной' },
      },
    },
  },
  {
    name: 'list_tables',
    handler: listTables,
    description: 'Таблицы БД: имя в БД и в коде, сервис, число колонок, описание. Фильтр по подстроке',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: { mapPath: mapPathProp, query: { type: 'string', description: 'Подстрока имени или описания' } },
    },
  },
  {
    name: 'get_table',
    handler: getTable,
    description:
      'Схема таблицы: колонки (тип, ключ, NOT NULL, default, enum), внешние ключи в обе стороны, роуты, которые её читают и пишут',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'table'],
      properties: { mapPath: mapPathProp, table: { type: 'string', description: 'Имя таблицы в БД или в коде' } },
    },
  },
];

/** Индекс карты; обязательный mapPath проверяется здесь. */
function indexOf(args: Args): CodeIndex {
  return loadCodeIndex(mapPath.read(args));
}

/**
 * Необязательный фильтр по сервису: пустая строка или имя/id существующего сервиса.
 *
 * @throws Error со списком сервисов, если такого нет
 */
function serviceFilter(index: CodeIndex, args: Args): string {
  const service = str(args, 'service');
  if (service !== '' && findService(index, service) === undefined) {
    throw new Error(`сервис не найден: ${service}. Есть: ${index.code.services.map((s) => s.name).join(', ')}`);
  }
  return service;
}

/** Роут одной строкой для списков. */
function routeLine(index: CodeIndex, r: ApiRoute): Record<string, unknown> {
  const detail = routeDetail(index, r.id);
  const about = shortSummary(r.doc, r.comments);
  return {
    id: r.id,
    method: r.method,
    path: r.path,
    service: index.servicesById.get(r.serviceId)?.name ?? r.serviceId,
    ...(about === undefined ? {} : { summary: about }),
    autoSummary: routeAutoDoc(index, r).summary,
    ...(r.access === undefined ? {} : { access: r.access }),
    reads: detail?.reads.map((t) => t.dbName ?? t.table) ?? [],
    writes: detail?.writes.map((t) => t.dbName ?? t.table) ?? [],
    screens: detail?.callers.length ?? 0,
  };
}

/** Таблица одной строкой. */
function tableLine(index: CodeIndex, t: DbTable): Record<string, unknown> {
  const about = shortSummary(t.doc, t.comments);
  return {
    name: t.name,
    exportName: t.exportName,
    service: index.servicesById.get(t.serviceId)?.name ?? t.serviceId,
    columns: t.columns.length,
    ...(about === undefined ? {} : { summary: about }),
  };
}

/** Похожие роуты для подсказки, когда роут не найден. */
function similarRoutes(index: CodeIndex, ref: string): string[] {
  const tail = ref.split(/[\s/]+/).filter((s) => s !== '' && !s.startsWith(':')).pop()?.toLowerCase() ?? '';
  return index.code.routes
    .filter((r) => tail !== '' && r.path.toLowerCase().includes(tail))
    .slice(0, 10)
    .map((r) => `${r.method} ${r.path}`);
}

function listRoutes(args: Args): ToolResult {
  const index = indexOf(args);
  const service = serviceFilter(index, args);
  const routes = findRoutes(index, {
    ...(service === '' ? {} : { service }),
    ...(str(args, 'query') === '' ? {} : { query: str(args, 'query') }),
  });
  return ok({ ok: true, total: routes.length, routes: routes.map((r) => routeLine(index, r)) });
}

function getRoute(args: Args): ToolResult {
  const index = indexOf(args);
  const ref = requiredStr(args, 'route', 'id роута или «GET /api/v1/…»');
  const detail = routeDetail(index, ref);
  if (detail === undefined) {
    return fail(`роут не найден: ${ref}. Похожие: ${similarRoutes(index, ref).join('; ') || 'нет'}`);
  }
  const { route } = detail;
  return ok({
    ok: true,
    id: route.id,
    method: route.method,
    path: route.path,
    framework: route.framework,
    service: detail.service?.name ?? route.serviceId,
    ...(route.doc === undefined ? {} : { doc: route.doc }),
    ...(route.comments === undefined ? {} : { comments: route.comments }),
    location: route.location,
    handler: route.handler,
    ...(route.input === undefined ? {} : { input: route.input }),
    ...(route.access === undefined ? {} : { access: route.access }),
    ...(route.response === undefined ? {} : { response: route.response }),
    autoDoc: { note: AUTO_DOC_NOTE, ...routeAutoDoc(index, route) },
    reads: detail.reads,
    writes: detail.writes,
    screens: detail.callers,
    ...optionalGap(index, route),
  });
}

/** Причина «без экранов» для выдачи; у роута с экранами — ничего. */
function optionalGap(index: CodeIndex, route: ApiRoute): { noScreens?: { kind: string; reason: string; files: readonly string[] } } {
  const gap = routeScreenGap(index, route);
  return gap === undefined ? {} : { noScreens: { kind: gap.kind, reason: gap.text, files: gap.files } };
}

/** Строка роута в describe_api: авторское описание, описание из кода, причина без экранов. */
function apiRouteLine(index: CodeIndex, r: ApiRoute, withGap: boolean): string {
  const about = shortSummary(r.doc, r.comments);
  const auto = routeAutoDoc(index, r).summary;
  const gap = withGap ? routeScreenGap(index, r) : undefined;
  return [
    `${r.method} ${r.path}${about === undefined ? '' : ` — ${about}`}`,
    `из кода: ${auto}`,
    ...(gap === undefined ? [] : [`без экранов: ${gap.text}`]),
  ].join(' · ');
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];

function describeApi(args: Args): ToolResult {
  const index = indexOf(args);
  const service = serviceFilter(index, args);
  const methodArg = str(args, 'method').toUpperCase();
  const method = METHODS.find((m) => m === methodArg);
  if (methodArg !== '' && method === undefined) {
    return fail(`method: одно из ${METHODS.join(', ')}`);
  }
  const filter: ApiFilter = {
    ...(service === '' ? {} : { service }),
    ...(method === undefined ? {} : { methods: [method] }),
    ...(str(args, 'table') === '' ? {} : { table: str(args, 'table') }),
    ...(args['undocumented'] === true ? { undocumented: true } : {}),
    ...(args['noScreens'] === true ? { noScreens: true } : {}),
  };
  const withGap = args['noScreens'] === true;
  const services = apiArchitecture(index, filter).map((s) => ({
    service: s.service.name,
    root: s.service.root,
    routes: s.count,
    coverage: apiCoverage(index, s.sections.flatMap((x) => x.modules.flatMap((m) => m.routes))),
    sections: s.sections.map((sec) => ({
      prefix: sec.prefix,
      routes: sec.count,
      modules: sec.modules.map((m) => ({
        prefix: m.prefix,
        routes: m.routes.map((r) => apiRouteLine(index, r, withGap)),
      })),
    })),
  }));
  return ok({ ok: true, note: `«из кода:» — ${AUTO_DOC_NOTE}`, coverage: apiCoverage(index, filterRoutes(index, filter)), services });
}

function listTables(args: Args): ToolResult {
  const index = indexOf(args);
  const q = str(args, 'query').toLowerCase();
  const tables = index.code.tables.filter(
    (t) => q === '' || `${t.name}\n${t.exportName}\n${t.doc ?? ''}`.toLowerCase().includes(q),
  );
  return ok({ ok: true, total: tables.length, tables: tables.map((t) => tableLine(index, t)) });
}

function getTable(args: Args): ToolResult {
  const index = indexOf(args);
  const name = requiredStr(args, 'table', 'имя таблицы в БД или в коде');
  const d = tableDetail(index, name);
  if (d === undefined) {
    const near = index.code.tables.filter((t) => t.name.includes(name.toLowerCase())).map((t) => t.name).slice(0, 10);
    return fail(`таблица не найдена: ${name}. Похожие: ${near.join(', ') || 'нет'}`);
  }
  const t = d.table;
  const nameOf = (exportName: string): string => findTable(index, exportName)?.name ?? exportName;
  return ok({
    ok: true,
    name: t.name,
    exportName: t.exportName,
    orm: t.orm,
    service: d.service?.name ?? t.serviceId,
    ...(t.doc === undefined ? {} : { doc: t.doc }),
    location: t.location,
    columns: t.columns,
    references: d.references.map((r) => ({ ...r, table: nameOf(r.table) })),
    referencedBy: d.referencedBy.map((r) => ({ ...r, table: nameOf(r.table) })),
    readBy: d.readBy.map((r) => `${r.method} ${r.path}`),
    writtenBy: d.writtenBy.map((r) => `${r.method} ${r.path}`),
  });
}
