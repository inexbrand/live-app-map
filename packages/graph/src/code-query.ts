/**
 * Запросы к разделу `code` карты: сервисы, роуты, таблицы, связи таблиц и экраны,
 * которые вызывают роут. Общие для MCP-сервера и визуализатора.
 */
import type {
  ApiRoute,
  AppMapDocument,
  CodeModel,
  CodeService,
  DbOperation,
  DbTable,
} from '@live-app-map/schema';

/** Индекс раздела code: строится один раз на карту. */
export type CodeIndex = {
  readonly code: CodeModel;
  readonly routesById: ReadonlyMap<string, ApiRoute>;
  readonly servicesById: ReadonlyMap<string, CodeService>;
  /** exportName таблицы → таблица. */
  readonly tablesByExport: ReadonlyMap<string, DbTable>;
  /** id роута → экраны, которые его вызывают. */
  readonly callersByRoute: ReadonlyMap<string, readonly RouteCaller[]>;
};

/** Экран, из которого вызывается роут. */
export type RouteCaller = {
  readonly nodeId?: string;
  readonly title: string;
  readonly file: string;
  readonly via?: string;
};

/** Сводка сервиса. */
export type ServiceSummary = {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly routes: number;
  readonly tables: number;
  readonly symbols: number;
};

/** Таблица, которую роут читает или пишет. */
export type TableTouch = {
  /** exportName таблицы (имя в коде). */
  readonly table: string;
  /** Имя в БД; нет — таблица не найдена в схеме. */
  readonly dbName?: string;
  readonly operations: readonly DbOperation[];
  readonly count: number;
  /** Хотя бы один запрос — в цикле (N+1). */
  readonly inLoop: boolean;
};

/** Роут целиком: сервис, таблицы на чтение и запись, экраны. */
export type RouteDetail = {
  readonly route: ApiRoute;
  readonly service?: CodeService;
  readonly reads: readonly TableTouch[];
  readonly writes: readonly TableTouch[];
  readonly callers: readonly RouteCaller[];
};

/** Внешний ключ таблицы. */
export type TableReference = {
  /** Колонка этой таблицы. */
  readonly column: string;
  /** Таблица-цель (exportName). */
  readonly table: string;
  readonly targetColumn: string;
  readonly onDelete?: string;
};

/** Ссылка на таблицу из другой таблицы. */
export type TableReferrer = {
  /** Таблица, которая ссылается (exportName). */
  readonly table: string;
  /** Её колонка. */
  readonly column: string;
  /** Колонка этой таблицы. */
  readonly targetColumn: string;
  readonly onDelete?: string;
};

/** Таблица целиком: колонки, связи, роуты. */
export type TableDetail = {
  readonly table: DbTable;
  readonly service?: CodeService;
  readonly references: readonly TableReference[];
  readonly referencedBy: readonly TableReferrer[];
  readonly readBy: readonly ApiRoute[];
  readonly writtenBy: readonly ApiRoute[];
};

/** Фильтр поиска роутов. */
export type RouteFilter = {
  /** Имя сервиса (`@korbor/api`) или его id. */
  readonly service?: string;
  /** Подстрока пути, метода или описания, без учёта регистра. */
  readonly query?: string;
};

const READ_OPS: ReadonlySet<DbOperation> = new Set<DbOperation>(['select', 'count']);

/**
 * Строит индекс раздела code. Карта без code даёт пустой индекс.
 *
 * @param doc - карта
 * @returns индекс
 */
export function buildCodeIndex(doc: AppMapDocument): CodeIndex {
  const code: CodeModel = doc.code ?? { root: '.', services: [], symbols: [], routes: [], tables: [] };
  const titles = new Map(doc.nodes.map((n) => [n.id, n.title]));
  const calls = new Map((code.apiCalls ?? []).map((c) => [c.id, c]));
  const callersByRoute = new Map<string, RouteCaller[]>();
  for (const screen of code.screens ?? []) {
    for (const sc of screen.calls) {
      const routeId = calls.get(sc.callId)?.routeId;
      if (routeId === undefined) {
        continue;
      }
      const list = callersByRoute.get(routeId) ?? [];
      const key = screen.nodeId ?? screen.file;
      if (!list.some((c) => (c.nodeId ?? c.file) === key)) {
        list.push({
          ...(screen.nodeId === undefined ? {} : { nodeId: screen.nodeId }),
          title: (screen.nodeId === undefined ? undefined : titles.get(screen.nodeId)) ?? screen.file,
          file: screen.file,
          ...(sc.via === undefined ? {} : { via: sc.via }),
        });
      }
      callersByRoute.set(routeId, list);
    }
  }
  return {
    code,
    routesById: new Map(code.routes.map((r) => [r.id, r])),
    servicesById: new Map(code.services.map((s) => [s.id, s])),
    tablesByExport: new Map(code.tables.map((t) => [t.exportName, t])),
    callersByRoute,
  };
}

/**
 * Сервисы с числом роутов, таблиц и символов.
 *
 * @param index - индекс
 * @returns сводки в порядке сервисов карты
 */
export function serviceSummaries(index: CodeIndex): ServiceSummary[] {
  const count = (items: readonly { readonly serviceId: string }[]): Map<string, number> => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.serviceId, (m.get(i.serviceId) ?? 0) + 1));
    return m;
  };
  const routes = count(index.code.routes);
  const tables = count(index.code.tables);
  const symbols = count(index.code.symbols);
  return index.code.services.map((s) => ({
    id: s.id,
    name: s.name,
    root: s.root,
    routes: routes.get(s.id) ?? 0,
    tables: tables.get(s.id) ?? 0,
    symbols: symbols.get(s.id) ?? 0,
  }));
}

/** Сервис по имени или id. */
export function findService(index: CodeIndex, nameOrId: string): CodeService | undefined {
  return index.servicesById.get(nameOrId) ?? index.code.services.find((s) => s.name === nameOrId);
}

/**
 * Роуты по сервису и подстроке.
 *
 * @param index - индекс
 * @param filter - сервис и/или подстрока
 * @returns роуты в порядке карты
 */
export function findRoutes(index: CodeIndex, filter: RouteFilter): ApiRoute[] {
  const service = filter.service === undefined ? undefined : findService(index, filter.service);
  if (filter.service !== undefined && service === undefined) {
    return [];
  }
  const q = filter.query?.trim().toLowerCase() ?? '';
  return index.code.routes.filter(
    (r) =>
      (service === undefined || r.serviceId === service.id) &&
      (q === '' || `${r.method} ${r.path}\n${r.doc ?? ''}\n${(r.comments ?? []).join('\n')}`.toLowerCase().includes(q)),
  );
}

/**
 * Роут по id или по «METHOD /path» (метод без учёта регистра).
 *
 * @param index - индекс
 * @param ref - id или метод с путём
 * @returns роут или undefined
 */
export function findRoute(index: CodeIndex, ref: string): ApiRoute | undefined {
  const byId = index.routesById.get(ref);
  if (byId !== undefined) {
    return byId;
  }
  const m = /^\s*([a-z]+)\s+(\S+)\s*$/i.exec(ref);
  if (m?.[1] === undefined || m[2] === undefined) {
    return undefined;
  }
  const method = m[1].toUpperCase();
  const path = m[2];
  return index.code.routes.find((r) => r.method === method && r.path === path);
}

/** Сворачивает запросы роута в таблицы на чтение и запись. */
function touches(index: CodeIndex, route: ApiRoute, read: boolean): TableTouch[] {
  const byTable = new Map<string, { ops: Set<DbOperation>; count: number; inLoop: boolean }>();
  for (const c of route.dbCalls) {
    if (READ_OPS.has(c.operation) !== read) {
      continue;
    }
    const prev = byTable.get(c.table) ?? { ops: new Set<DbOperation>(), count: 0, inLoop: false };
    prev.ops.add(c.operation);
    byTable.set(c.table, { ops: prev.ops, count: prev.count + 1, inLoop: prev.inLoop || c.inLoop === true });
  }
  return [...byTable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, v]) => {
      const dbName = index.tablesByExport.get(table)?.name;
      return {
        table,
        ...(dbName === undefined ? {} : { dbName }),
        operations: [...v.ops].sort(),
        count: v.count,
        inLoop: v.inLoop,
      };
    });
}

/**
 * Роут целиком.
 *
 * @param index - индекс
 * @param ref - id или «METHOD /path»
 * @returns детали или undefined
 */
export function routeDetail(index: CodeIndex, ref: string): RouteDetail | undefined {
  const route = findRoute(index, ref);
  if (route === undefined) {
    return undefined;
  }
  const service = index.servicesById.get(route.serviceId);
  return {
    route,
    ...(service === undefined ? {} : { service }),
    reads: touches(index, route, true),
    writes: touches(index, route, false),
    callers: index.callersByRoute.get(route.id) ?? [],
  };
}

/**
 * Таблица по имени в коде, имени в БД или id.
 *
 * @param index - индекс
 * @param name - имя
 * @returns таблица или undefined
 */
export function findTable(index: CodeIndex, name: string): DbTable | undefined {
  return (
    index.tablesByExport.get(name) ??
    index.code.tables.find((t) => t.name === name || t.id === name) ??
    index.code.tables.find((t) => t.name.toLowerCase() === name.toLowerCase() || t.exportName.toLowerCase() === name.toLowerCase())
  );
}

/**
 * Таблица целиком: колонки, внешние ключи в обе стороны, роуты на чтение и запись.
 *
 * @param index - индекс
 * @param name - имя в коде, в БД или id
 * @returns детали или undefined
 */
export function tableDetail(index: CodeIndex, name: string): TableDetail | undefined {
  const table = findTable(index, name);
  if (table === undefined) {
    return undefined;
  }
  const references: TableReference[] = table.columns.flatMap((c) =>
    c.references === undefined
      ? []
      : [{ column: c.name, table: c.references.table, targetColumn: c.references.column, ...(c.references.onDelete === undefined ? {} : { onDelete: c.references.onDelete }) }],
  );
  const referencedBy: TableReferrer[] = index.code.tables.flatMap((t) =>
    t.columns.flatMap((c) =>
      c.references?.table === table.exportName
        ? [{ table: t.exportName, column: c.name, targetColumn: c.references.column, ...(c.references.onDelete === undefined ? {} : { onDelete: c.references.onDelete }) }]
        : [],
    ),
  );
  const touching = (read: boolean): ApiRoute[] =>
    index.code.routes.filter((r) => r.dbCalls.some((c) => c.table === table.exportName && READ_OPS.has(c.operation) === read));
  const service = index.servicesById.get(table.serviceId);
  return {
    table,
    ...(service === undefined ? {} : { service }),
    references,
    referencedBy,
    readBy: touching(true),
    writtenBy: touching(false),
  };
}

/** Предел длины краткого описания. */
const SUMMARY_MAX = 220;

/**
 * Краткое описание из комментария: первый абзац без повтора «\`METHOD /path\` —»;
 * если в нём только ссылки на спеку, добавляется следующий абзац.
 *
 * @param doc - JSDoc
 * @param comments - обычные комментарии
 * @returns одна строка или undefined
 */
export function shortSummary(doc: string | undefined, comments?: readonly string[]): string | undefined {
  const text = doc ?? comments?.[0];
  if (text === undefined) {
    return undefined;
  }
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .map((p) => p.replace(/^`?(GET|POST|PUT|PATCH|DELETE|ALL|HEAD|OPTIONS)\s+[^\s`]+`?\s*[—–-]?\s*/i, ''))
    .filter((p) => p !== '');
  let out = paragraphs[0] ?? '';
  // Абзац из одних ссылок на блоки спеки: «блок 054-….md §2» — мало смысла, берём ещё один.
  const words = out.replace(/[\w./§-]*\.md\b|§[\d./]+|\b\d+\b|блок/gi, '').replace(/[^\p{L}]+/gu, ' ').trim();
  if (words.length < 12 && paragraphs[1] !== undefined) {
    out = `${out} ${paragraphs[1]}`.trim();
  }
  return out.length > SUMMARY_MAX ? `${out.slice(0, SUMMARY_MAX - 1)}…` : out;
}
