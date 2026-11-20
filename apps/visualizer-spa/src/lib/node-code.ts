/**
 * Код для панели ноды: что показать у сервиса и у экрана из раздела `code`.
 */
import type {
  ApiRoute,
  AppMapDocument,
  CodeService,
  CodeSymbol,
  DbCall,
  DbOperation,
  DbTable,
} from '@live-app-map/schema';

/** Код сервиса: роуты, таблицы (свои и используемые роутами), символы. */
export type ServiceCodeView = {
  readonly kind: 'service';
  readonly service: CodeService;
  readonly routes: readonly ApiRoute[];
  readonly tables: readonly DbTable[];
  readonly symbols: readonly CodeSymbol[];
};

/** Код экрана: символы файла, на который указывает нода. */
export type PageCodeView = {
  readonly kind: 'page';
  readonly file: string;
  readonly symbols: readonly CodeSymbol[];
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
 * Путь файла ноды экрана от корня скана исходников (POSIX).
 *
 * @param projectRoot - project.root карты (каталог приложения)
 * @param codeRoot - code.root (каталог скана исходников)
 * @param sourceFile - source.file ноды (от project.root)
 * @returns путь от code.root или null, если приложение вне каталога скана
 */
export function codeFileOfNode(projectRoot: string, codeRoot: string, sourceFile: string): string | null {
  const app = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const code = codeRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  if (app === code) {
    return sourceFile;
  }
  if (!app.startsWith(`${code}/`)) {
    return null;
  }
  return `${app.slice(code.length + 1)}/${sourceFile}`;
}

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
    return { kind: 'service', service, routes, tables, symbols };
  }
  const sourceFile = node.source?.file;
  const file = sourceFile === undefined ? null : codeFileOfNode(doc.project.root, code.root, sourceFile);
  if (file === null) {
    return null;
  }
  return { kind: 'page', file, symbols: code.symbols.filter((s) => s.location.file === file) };
}
