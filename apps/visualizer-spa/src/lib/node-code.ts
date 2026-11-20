/**
 * Код для панели ноды: что показать у сервиса и у экрана из раздела `code`.
 */
import type {
  ApiCall,
  ApiRoute,
  AppMapDocument,
  AppMapNode,
  CodeModel,
  CodeService,
  CodeSymbol,
  DbCall,
  DbOperation,
  DbTable,
} from '@live-app-map/schema';
import { codeFileOfNode, screenOf } from '@live-app-map/schema';

/** Экран, который вызывает роут. */
export type RouteCaller = { readonly nodeId: string; readonly title: string };

/** Код сервиса: роуты, таблицы (свои и используемые роутами), символы, экраны-вызывающие. */
export type ServiceCodeView = {
  readonly kind: 'service';
  readonly service: CodeService;
  readonly routes: readonly ApiRoute[];
  readonly tables: readonly DbTable[];
  readonly symbols: readonly CodeSymbol[];
  /** id роута → экраны, которые его вызывают. */
  readonly callers: ReadonlyMap<string, readonly RouteCaller[]>;
};

/** Вызов API экрана; у сопоставленного — роут, его сервис и запросы в БД. */
export type ScreenApiItem = {
  readonly call: ApiCall;
  /** Функция или компонент между экраном и вызовом. */
  readonly via?: string;
  readonly route?: ApiRoute;
  readonly service?: CodeService;
  readonly db: readonly DbCallGroup[];
};

/** Код экрана: символы файла и вызовы API, достижимые из него. */
export type PageCodeView = {
  readonly kind: 'page';
  readonly file: string;
  readonly symbols: readonly CodeSymbol[];
  /** Вызовы, сопоставленные с роутами. */
  readonly api: readonly ScreenApiItem[];
  /** Вызовы без роута в карте. */
  readonly unmatched: readonly ScreenApiItem[];
};

/** Что показать в панели; null — в карте нет кода для ноды. */
export type NodeCodeView = ServiceCodeView | PageCodeView | null;

/** Строка «операция × таблица» для списка запросов роута. */
export type DbCallGroup = {
  readonly operation: DbOperation;
  readonly table: string;
  readonly count: number;
  /** Хотя бы один вызов группы — в цикле (N+1). */
  readonly inLoop: boolean;
};

/**
 * Сворачивает вызовы БД роута по (операция, таблица), порядок — по таблице.
 *
 * @param calls - вызовы БД
 * @returns группы со счётчиком
 */
export function groupDbCalls(calls: readonly DbCall[]): DbCallGroup[] {
  const groups = new Map<string, DbCallGroup>();
  for (const c of calls) {
    const key = `${c.table}|${c.operation}`;
    const prev = groups.get(key);
    groups.set(key, {
      operation: c.operation,
      table: c.table,
      count: (prev?.count ?? 0) + 1,
      inLoop: (prev?.inLoop ?? false) || c.inLoop === true,
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.table === b.table ? a.operation.localeCompare(b.operation) : a.table.localeCompare(b.table),
  );
}

/**
 * Код для выбранной ноды.
 *
 * @param doc - карта
 * @param nodeId - id ноды
 * @returns вид для панели или null
 */
export function selectNodeCode(doc: AppMapDocument, nodeId: string): NodeCodeView {
  const code = doc.code;
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (code === undefined || node === undefined) {
    return null;
  }
  if (node.kind === 'service') {
    const service = code.services.find((s) => s.id === node.id);
    if (service === undefined) {
      return null;
    }
    const routes = code.routes.filter((r) => r.serviceId === service.id);
    const used = new Set(routes.flatMap((r) => r.dbCalls.map((c) => c.table)));
    const tables = code.tables.filter((t) => t.serviceId === service.id || used.has(t.exportName));
    const symbols = code.symbols.filter((s) => s.serviceId === service.id);
    return { kind: 'service', service, routes, tables, symbols, callers: routeCallers(doc, new Set(routes.map((r) => r.id))) };
  }
  const file = fileOfNode(doc, node);
  if (file === null) {
    return null;
  }
  const items = screenItems(code, node.id, file);
  return {
    kind: 'page',
    file,
    symbols: code.symbols.filter((s) => s.location.file === file),
    api: items.filter((i) => i.route !== undefined),
    unmatched: items.filter((i) => i.route === undefined),
  };
}

/** Файл ноды экрана от code.root или null. */
function fileOfNode(doc: AppMapDocument, node: AppMapNode): string | null {
  const sourceFile = node.source?.file;
  return doc.code === undefined || sourceFile === undefined
    ? null
    : codeFileOfNode(doc.project.root, doc.code.root, sourceFile);
}

/**
 * Вызовы API экрана: один пункт на метод+путь, порядок — по пути.
 *
 * @param code - раздел code
 * @param nodeId - нода экрана
 * @param file - файл экрана
 * @returns пункты с роутом, сервисом и запросами в БД
 */
function screenItems(code: CodeModel, nodeId: string, file: string): ScreenApiItem[] {
  const calls = new Map((code.apiCalls ?? []).map((c) => [c.id, c]));
  const routes = new Map(code.routes.map((r) => [r.id, r]));
  const services = new Map(code.services.map((s) => [s.id, s]));
  const items = new Map<string, ScreenApiItem>();
  for (const sc of screenOf(code, nodeId, file)?.calls ?? []) {
    const call = calls.get(sc.callId);
    if (call === undefined || items.has(`${call.method} ${call.path}`)) {
      continue;
    }
    const route = call.routeId === undefined ? undefined : routes.get(call.routeId);
    const service = route === undefined ? undefined : services.get(route.serviceId);
    items.set(`${call.method} ${call.path}`, {
      call,
      ...(sc.via === undefined ? {} : { via: sc.via }),
      ...(route === undefined ? {} : { route }),
      ...(service === undefined ? {} : { service }),
      db: route === undefined ? [] : groupDbCalls(route.dbCalls),
    });
  }
  return [...items.values()].sort((a, b) => a.call.path.localeCompare(b.call.path));
}

/**
 * Экраны карты, которые вызывают роуты из набора.
 *
 * @param doc - карта
 * @param routeIds - роуты сервиса
 * @returns id роута → экраны
 */
function routeCallers(doc: AppMapDocument, routeIds: ReadonlySet<string>): Map<string, RouteCaller[]> {
  const out = new Map<string, RouteCaller[]>();
  const code = doc.code;
  if (code === undefined) {
    return out;
  }
  for (const node of doc.nodes) {
    const file = node.kind === 'service' ? null : fileOfNode(doc, node);
    if (file === null) {
      continue;
    }
    for (const item of screenItems(code, node.id, file)) {
      const id = item.route?.id;
      if (id !== undefined && routeIds.has(id)) {
        const list = out.get(id) ?? [];
        if (!list.some((c) => c.nodeId === node.id)) {
          list.push({ nodeId: node.id, title: node.title });
        }
        out.set(id, list);
      }
    }
  }
  return out;
}