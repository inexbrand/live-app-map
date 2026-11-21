/**
 * MCP tools базы знаний по коду: сервисы, роуты, таблицы, связи и экраны.
 * Читают раздел `code` карты (собирается `scan --code-dir`).
 */
import {
  apiArchitecture,
  apiCoverage,
  filterRoutes,
  findRoutes,
  findService,
  findTable,
  routeDetail,
  serviceSummaries,
  shortSummary,
  tableDetail,
  type ApiFilter,
  type CodeIndex,
} from '@live-app-map/graph';
import type { ApiRoute, DbTable, HttpMethod } from '@live-app-map/schema';
import { loadCodeIndex } from './map-tools';
import type { ToolDef, ToolResult } from './tools';

/** Аргументы tool. */
type Args = Readonly<Record<string, unknown>>;

const mapPathProp = {
  type: 'string',
  description: 'Путь к карте с разделом code, например maps/korbor-all.liveappmap.json',
};

/** Каталог tools базы знаний. */
export const CODE_TOOLS: readonly ToolDef[] = [
  {
    name: 'list_services',
    description: 'Сервисы проекта (пакеты монорепо) с числом HTTP-роутов, таблиц БД и символов',
    inputSchema: { type: 'object', required: ['mapPath'], properties: { mapPath: mapPathProp } },
  },
  {
    name: 'list_routes',
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
    description:
      'Роут целиком: что делает (комментарии), где обработчик, какие таблицы читает и пишет (с признаком N+1), какие экраны его вызывают',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'route'],
      properties: { mapPath: mapPathProp, route: { type: 'string', description: 'id роута или «GET /api/v1/…»' } },
    },
  },
  {
    name: 'describe_api',
    description:
      'Архитектура API: сервисы → разделы (/api/v1/admin) → модули (/api/v1/admin/vacancies) с роутами; покрытие описаниями, проверкой входа, доступом и экранами. Фильтр по сервису, методу, таблице, «без описания»',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: {
        mapPath: mapPathProp,
        service: { type: 'string', description: 'Имя сервиса (@korbor/api) или id' },
        method: { type: 'string', description: 'HTTP-метод: GET, POST …' },
        table: { type: 'string', description: 'Только роуты, которые читают или пишут таблицу' },
        undocumented: { type: 'boolean', description: 'Только роуты без описания' },
      },
    },
  },
  {
    name: 'list_tables',
    description: 'Таблицы БД: имя в БД и в коде, сервис, число колонок, описание. Фильтр по подстроке',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: { mapPath: mapPathProp, query: { type: 'string', description: 'Подстрока имени или описания' } },
    },
  },
  {
    name: 'get_table',
    description:
      'Схема таблицы: колонки (тип, ключ, NOT NULL, default, enum), внешние ключи в обе стороны, роуты, которые её читают и пишут',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'table'],
      properties: { mapPath: mapPathProp, table: { type: 'string', description: 'Имя таблицы в БД или в коде' } },
    },
  },
];

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Строковый аргумент: пустая строка, если не задан. */
function str(args: Args, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Индекс карты; обязательный mapPath проверяется здесь. */
function indexOf(args: Args): CodeIndex {
  const mapPath = str(args, 'mapPath');
  if (mapPath === '') {
    throw new Error('mapPath обязателен: путь к карте с разделом code, например maps/korbor-all.liveappmap.json');
  }
  return loadCodeIndex(mapPath);
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
  const service = str(args, 'service');
  if (service !== '' && findService(index, service) === undefined) {
    return fail(`сервис не найден: ${service}. Есть: ${index.code.services.map((s) => s.name).join(', ')}`);
  }
  const routes = findRoutes(index, {
    ...(service === '' ? {} : { service }),
    ...(str(args, 'query') === '' ? {} : { query: str(args, 'query') }),
  });
  return ok({ ok: true, total: routes.length, routes: routes.map((r) => routeLine(index, r)) });
}

function getRoute(args: Args): ToolResult {
  const index = indexOf(args);
  const ref = str(args, 'route');
  if (ref === '') {
    return fail('route обязателен: id роута или «GET /api/v1/…»');
  }
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
    reads: detail.reads,
    writes: detail.writes,
    screens: detail.callers,
  });
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];

function describeApi(args: Args): ToolResult {
  const index = indexOf(args);
  const service = str(args, 'service');
  if (service !== '' && findService(index, service) === undefined) {
    return fail(`сервис не найден: ${service}. Есть: ${index.code.services.map((s) => s.name).join(', ')}`);
  }
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
  };
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
        routes: m.routes.map((r) => {
          const about = shortSummary(r.doc, r.comments);
          return `${r.method} ${r.path}${about === undefined ? '' : ` — ${about}`}`;
        }),
      })),
    })),
  }));
  return ok({ ok: true, coverage: apiCoverage(index, filterRoutes(index, filter)), services });
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
  const name = str(args, 'table');
  if (name === '') {
    return fail('table обязателен: имя таблицы в БД или в коде');
  }
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

/** Обработчики tools базы знаний. */
export const CODE_HANDLERS: ReadonlyMap<string, (args: Args) => ToolResult> = new Map([
  ['list_services', (args: Args) => ok({ ok: true, services: serviceSummaries(indexOf(args)) })],
  ['list_routes', listRoutes],
  ['get_route', getRoute],
  ['describe_api', describeApi],
  ['list_tables', listTables],
  ['get_table', getTable],
]);
