/**
 * Запросы к разделу `docs` карты: эпохи, поиск по тексту документов и
 * разбор ссылок из текста (`GET /api/x`, путь экрана, файл, таблица) на сущности карты.
 */
import { codeFileOfNode } from '@live-app-map/schema';
import type { ApiRoute, AppMapDocument, DocEpoch, DocFile, DocsModel, EpochReadiness, HttpMethod } from '@live-app-map/schema';
import type { CodeIndex } from './code-query';

/** Фильтр эпох. */
export type EpochFilter = {
  /** Подстрока имени, цели или открытых пунктов. */
  readonly query?: string;
  readonly readiness?: EpochReadiness;
};

/**
 * Эпохи под фильтр (порядок раздела: новые первыми).
 *
 * @param docs - раздел docs
 * @param filter - фильтр
 * @returns эпохи
 */
export function epochList(docs: DocsModel, filter: EpochFilter = {}): DocEpoch[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return docs.epochs.filter(
    (e) =>
      (filter.readiness === undefined || e.readiness === filter.readiness) &&
      (q === '' || [e.id, e.summary ?? '', ...e.openBugs].join('\n').toLowerCase().includes(q)),
  );
}

/**
 * Эпоха по имени папки или по slug (самая новая с этим slug).
 *
 * @param docs - раздел docs
 * @param ref - `api-docs-views#20261121-205636` или `api-docs-views`
 * @returns эпоха или undefined
 */
export function findEpoch(docs: DocsModel, ref: string): DocEpoch | undefined {
  const r = ref.trim();
  return docs.epochs.find((e) => e.id === r) ?? docs.epochs.find((e) => e.slug === r);
}

/** Найденное место в документе. */
export type DocHit = {
  readonly path: string;
  readonly title: string;
  /** Эпоха, если документ из эпохи. */
  readonly epochId?: string;
  /** Строка с 1. */
  readonly line: number;
  /** Строка с совпадением (до 240 символов). */
  readonly snippet: string;
};

/** Все документы раздела с эпохой. */
function allDocs(docs: DocsModel): { file: DocFile; epochId?: string }[] {
  return [
    ...docs.epochs.flatMap((e) => e.files.map((file) => ({ file, epochId: e.id }))),
    ...docs.notes.map((file) => ({ file })),
    ...docs.guides.map((file) => ({ file })),
  ];
}

const SNIPPET_MAX = 240;

/**
 * Поиск подстроки по тексту всех документов: одно попадание на строку,
 * совпадение в заголовке или пути — первым.
 *
 * @param docs - раздел docs
 * @param query - подстрока без учёта регистра
 * @param limit - предел попаданий
 * @returns попадания
 */
export function searchDocs(docs: DocsModel, query: string, limit = 50): DocHit[] {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return [];
  }
  const titled: DocHit[] = [];
  const inText: DocHit[] = [];
  for (const { file, epochId } of allDocs(docs)) {
    const base = { path: file.path, title: file.title, ...(epochId === undefined ? {} : { epochId }) };
    const byTitle = `${file.title}\n${file.path}`.toLowerCase().includes(q);
    if (byTitle) {
      titled.push({ ...base, line: 1, snippet: file.title });
    }
    file.text.split('\n').forEach((text, i) => {
      // Строка 1 уже найдена по заголовку — второй строкой списка она не нужна
      if (!(byTitle && i === 0) && text.toLowerCase().includes(q)) {
        const t = text.trim();
        inText.push({ ...base, line: i + 1, snippet: t.length > SNIPPET_MAX ? `${t.slice(0, SNIPPET_MAX - 1)}…` : t });
      }
    });
  }
  return [...titled, ...inText].slice(0, limit);
}

/** Сущность карты, на которую указывает ссылка из документа. */
export type DocTarget =
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'screen'; readonly nodeId: string }
  | { readonly kind: 'file'; readonly file: string; readonly line?: number };

/** Обработчик на каждый вид цели. */
export type DocTargetCases<R> = { readonly [K in DocTarget['kind']]: (t: Extract<DocTarget, { kind: K }>) => R };

/**
 * Разбор цели по виду: единственное место, где перечислены виды DocTarget.
 *
 * @param t - цель
 * @param cases - обработчик на каждый вид
 */
export function matchDocTarget<R>(t: DocTarget, cases: DocTargetCases<R>): R {
  switch (t.kind) {
    case 'route':
      return cases.route(t);
    case 'table':
      return cases.table(t);
    case 'screen':
      return cases.screen(t);
    case 'file':
      return cases.file(t);
  }
}

/** Индекс для разбора ссылок из документов. */
export type DocRefIndex = {
  readonly code?: CodeIndex;
  /** Нормализованный путь экрана → id ноды. */
  readonly screensByPath: ReadonlyMap<string, string>;
  /** Файл экрана от корня кода → id ноды. */
  readonly screensByFile: ReadonlyMap<string, string>;
  /** Файлы проекта, известные карте (роуты, таблицы, символы, экраны). */
  readonly knownFiles: ReadonlySet<string>;
};

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];

/** Строка — HTTP-метод. */
function isHttpMethod(s: string | undefined): s is HttpMethod {
  return METHODS.some((m) => m === s);
}

/** Путь без query, `[id]`/`{id}`/`$id` → `:id`, без завершающего слеша. */
export function normalizeRoutePath(p: string): string {
  const clean = p.split(/[?#]/)[0] ?? p;
  const n = clean
    .replace(/\[\.{3}([^\]]+)\]/g, '*$1')
    .replace(/\[([^\]]+)\]/g, ':$1')
    .replace(/\{([^}]+)\}/g, ':$1')
    .replace(/\/\$([\w]+)/g, '/:$1');
  return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n;
}

/** Путь без имён параметров: `/a/:id` → `/a/:`, чтобы `:id` и `:vacancyId` совпадали. */
function pathShape(p: string): string {
  return normalizeRoutePath(p).replace(/:[^/]+/g, ':');
}

/** Первое значение ключа не перезаписывается. */
function setFirst(map: Map<string, string>, key: string, value: string): void {
  if (!map.has(key)) {
    map.set(key, value);
  }
}

/** Файл экрана относительно корня кода (если код есть). */
function screenFileOf(doc: AppMapDocument, file: string | undefined, code: CodeIndex | undefined): string | undefined {
  return file === undefined || code === undefined ? file : (codeFileOfNode(doc.project.root, code.code.root, file) ?? file);
}

/**
 * Строит индекс разбора ссылок по карте.
 *
 * @param doc - карта
 * @param code - индекс кода (если в карте есть code)
 * @returns индекс
 */
export function buildDocRefIndex(doc: AppMapDocument, code?: CodeIndex): DocRefIndex {
  const screensByPath = new Map<string, string>();
  const screensByFile = new Map<string, string>();
  for (const n of doc.nodes) {
    if (n.kind === 'service' || n.pathPattern === undefined) {
      continue;
    }
    setFirst(screensByPath, pathShape(n.pathPattern), n.id);
    const rel = screenFileOf(doc, n.source?.file, code);
    if (rel !== undefined) {
      setFirst(screensByFile, rel, n.id);
    }
  }
  const knownFiles = new Set<string>(screensByFile.keys());
  const located = code === undefined ? [] : [...code.code.routes, ...code.code.tables, ...code.code.symbols];
  located.forEach((x) => knownFiles.add(x.location.file));
  return { ...(code === undefined ? {} : { code }), screensByPath, screensByFile, knownFiles };
}

/** Роут по методу и пути с точностью до имён параметров. */
function routeByPath(code: CodeIndex | undefined, method: HttpMethod | undefined, p: string): string | undefined {
  const shape = pathShape(p);
  return code?.code.routes.find((r) => (method === undefined || r.method === method) && pathShape(r.path) === shape)?.id;
}

/**
 * Сущность карты по тексту ссылки из документа (`код` или текст ссылки):
 * «METHOD /path» → роут; «/path» → роут или экран; «файл[:строка]» → роут, экран или файл;
 * имя таблицы → таблица.
 *
 * @param ref - текст ссылки
 * @param index - индекс разбора
 * @returns цель или undefined
 */
export function resolveDocRef(ref: string, index: DocRefIndex): DocTarget | undefined {
  const text = ref.trim().replace(/^`|`$/g, '');
  const methodPath = methodPathOf(text);
  if (methodPath !== null) {
    return routeTarget(routeByPath(index.code, methodPath.method, methodPath.path));
  }
  if (text.startsWith('/') && !/\s/.test(text)) {
    return pathTarget(text, index);
  }
  const fm = /^([\w@./-]+\.[a-z]{1,5})(?::(\d+))?$/i.exec(text);
  if (fm?.[1] !== undefined) {
    return fileTarget(fm[1], fm[2] === undefined ? undefined : Number(fm[2]), index);
  }
  const table = index.code === undefined ? undefined : findTableByName(index.code, text);
  return table === undefined ? undefined : { kind: 'table', table };
}

/** «GET /api/x» → метод и путь; иначе null. */
function methodPathOf(text: string): { readonly method: HttpMethod; readonly path: string } | null {
  const m = /^([A-Z]+)\s+(\/\S*)$/.exec(text);
  const method = m?.[1];
  return m?.[2] !== undefined && isHttpMethod(method) ? { method, path: m[2] } : null;
}

function routeTarget(routeId: string | undefined): DocTarget | undefined {
  return routeId === undefined ? undefined : { kind: 'route', routeId };
}

/** Путь без метода: роут с таким путём, иначе экран с такой формой пути. */
function pathTarget(text: string, index: DocRefIndex): DocTarget | undefined {
  const route = routeTarget(routeByPath(index.code, undefined, text));
  if (route !== undefined) {
    return route;
  }
  const nodeId = index.screensByPath.get(pathShape(text));
  return nodeId === undefined ? undefined : { kind: 'screen', nodeId };
}

/** Таблица по точному имени в коде или в БД. */
function findTableByName(code: CodeIndex, name: string): string | undefined {
  if (!/^[A-Za-z_][\w]*$/.test(name)) {
    return undefined;
  }
  return (code.tablesByExport.get(name) ?? code.code.tables.find((t) => t.name === name))?.exportName;
}

/** Файл: известный карте по полному пути или по хвосту пути. */
function fileTarget(file: string, line: number | undefined, index: DocRefIndex): DocTarget | undefined {
  const known = index.knownFiles.has(file) ? file : [...index.knownFiles].find((f) => f.endsWith(`/${file}`));
  if (known === undefined) {
    return undefined;
  }
  const nodeId = index.screensByFile.get(known);
  if (nodeId !== undefined) {
    return { kind: 'screen', nodeId };
  }
  return codeTargetInFile(known, line, index.code) ?? { kind: 'file', file: known, ...(line === undefined ? {} : { line }) };
}

/** Роут файла (по строке или единственный), иначе таблица файла (по строке или любая). */
function codeTargetInFile(file: string, line: number | undefined, code: CodeIndex | undefined): DocTarget | undefined {
  if (code === undefined) {
    return undefined;
  }
  const route = routeInFile(code, file, line);
  if (route !== undefined) {
    return { kind: 'route', routeId: route.id };
  }
  const table = code.code.tables.find((t) => t.location.file === file && (line === undefined || t.location.line === line));
  return table === undefined ? undefined : { kind: 'table', table: table.exportName };
}

/** Роут файла на этой строке (объявление или обработчик), иначе единственный роут файла. */
function routeInFile(code: CodeIndex, file: string, line: number | undefined): ApiRoute | undefined {
  const routes = code.code.routes.filter((r) => r.location.file === file);
  const exact = line === undefined ? undefined : routes.find((r) => r.location.line === line || r.handler.location.line === line);
  return exact ?? (routes.length === 1 ? routes[0] : undefined);
}
