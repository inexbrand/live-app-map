/**
 * TanStack Router: маршруты из кода (createRoute с getParentRoute) и из
 * файлов (createFileRoute('/path')), компоненты экранов и переходы между
 * экранами (Link to, navigate({ to }), redirect({ to })).
 */
import path from 'node:path';
import { balancedFrom, lineAt, linkTargetsAt, topLevelProps } from './source-text';

export { linkTargets, topLevelProps } from './source-text';

/** Маршрут TanStack Router. */
export type TanStackRoute = {
  /** Имя переменной маршрута (code-based) или путь файла (file-based). */
  readonly key: string;
  /** Полный путь в нотации TanStack: /clients/$id. */
  readonly fullPath: string;
  /** Файл, где объявлен маршрут. */
  readonly file: string;
  /** Файл компонента экрана, если известен. */
  readonly componentFile?: string;
  /** Куда маршрут уводит в beforeLoad (redirect({ to })). */
  readonly redirects: readonly string[];
  /** Строка объявления, с 1. */
  readonly line: number;
};

/** Переход между экранами. */
export type TanStackLink = {
  readonly fromPath: string;
  readonly toPath: string;
  readonly kind: 'link' | 'redirect';
  readonly file: string;
  /** Строка перехода (redirect — строка объявления маршрута), с 1. */
  readonly line: number;
  /** Переход из файла, общего для нескольких экранов (виджет журнала и т. п.). */
  readonly shared: boolean;
};

type Declared = {
  readonly key: string;
  readonly file: string;
  readonly parent: string | null;
  readonly isRoot: boolean;
  readonly path?: string;
  readonly fileRoutePath?: string;
  readonly component?: string;
  readonly redirects: string[];
  readonly line: number;
};

const STRING = /^["'`]([^"'`]*)["'`]/;
const IMPORT_CALL = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/;

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'`]([^"'`]+)["'`]/g;
const LAZY_IMPORT = /(?:const|let)\s+(\w+)\s*=\s*lazyRouteComponent\(\s*\(\)\s*=>\s*import\(\s*["'`]([^"'`]+)["'`]/g;

/** Локальное имя из части import { A, B as C, type D }. */
function localName(part: string): string {
  return part.split(/\s+as\s+/).pop()?.trim().replace(/^type\s+/, '') ?? '';
}

/** Файлы, на которые ссылаются имена в import { A, B as C } from './x'. */
function importedFiles(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, names = '', spec = ''] of source.matchAll(NAMED_IMPORT)) {
    for (const local of names.split(',').map(localName).filter((l) => l !== '')) {
      out.set(local, spec);
    }
  }
  for (const [, local = '', spec = ''] of source.matchAll(LAZY_IMPORT)) {
    out.set(local, spec);
  }
  return out;
}

/** Модуль относительно файла → путь от корня приложения (как ключ files). */
function resolveModule(fromFile: string, spec: string, files: ReadonlyMap<string, string>): string | undefined {
  if (!spec.startsWith('.')) {
    return undefined;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [base, ...['.tsx', '.ts', '.jsx', '.js'].flatMap((ext) => [base + ext, `${base}/index${ext}`])];
  return candidates.find((c) => files.has(c));
}

/**
 * Файл компонента по значению component: import('./x') — путь модуля, имя —
 * импорт или «.», если компонент объявлен в этом же файле.
 */
function componentFileOf(value: string | undefined, source: string, imports: ReadonlyMap<string, string>): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const lazy = IMPORT_CALL.exec(value)?.[1];
  if (lazy !== undefined) {
    return lazy;
  }
  const ident = /^([A-Za-z_$][\w$]*)\s*$/.exec(value)?.[1];
  if (ident === undefined) {
    return undefined;
  }
  // Компонент объявлен в этом же файле — экран живёт здесь.
  return imports.get(ident) ?? (new RegExp(`function\\s+${ident}\\b|const\\s+${ident}\\s*=`).test(source) ? '.' : undefined);
}

/** Имя родителя из getParentRoute: () => parentRoute. */
function parentOf(raw: string | undefined): string | null {
  return raw === undefined ? null : (/([A-Za-z_$][\w$]*)\s*\)?\s*$/.exec(raw)?.[1] ?? null);
}

/** Пути redirect({ to }) в beforeLoad. */
function redirectsOf(beforeLoad: string): string[] {
  return [...beforeLoad.matchAll(/redirect\(\s*\{[^}]*?\bto\s*:\s*["'`](\/[^"'`]*)["'`]/g)].flatMap((r) => (r[1] === undefined ? [] : [r[1]]));
}

/** Свойства объекта-аргумента вызова, открытого в open. */
function callProps(source: string, open: number): Map<string, string> {
  const call = balancedFrom(source, open);
  const objStart = call.indexOf('{');
  return objStart < 0 ? new Map<string, string>() : topLevelProps(balancedFrom(call, objStart));
}

const DECLARATION = /(?:(?:const|let)\s+(\w+)\s*=\s*)?(createRootRouteWithContext\s*<[^>]*>\s*\(\s*\)|createRootRoute|createRoute|createFileRoute\s*\(\s*["'`]([^"'`]*)["'`]\s*\))\s*\(/g;

function declarationsIn(file: string, source: string): Declared[] {
  const imports = importedFiles(source);
  return [...source.matchAll(DECLARATION)].map((m, n) => declarationOf(m, n, file, source, imports));
}

/** Компонент объявления: «.» (тот же файл) — сам файл. */
function componentOfDecl(props: ReadonlyMap<string, string>, file: string, source: string, imports: ReadonlyMap<string, string>): string | undefined {
  const comp = componentFileOf(props.get('component'), source, imports);
  return comp === '.' ? file : comp;
}

/** Необязательные поля объявления: path, fileRoutePath, component — только заданные. */
function routeWhere(props: ReadonlyMap<string, string>, fileRoutePath: string | undefined, component: string | undefined): Pick<Declared, 'path' | 'fileRoutePath' | 'component'> {
  const pathLit = STRING.exec(props.get('path') ?? '')?.[1];
  return {
    ...(pathLit === undefined ? {} : { path: pathLit }),
    ...(fileRoutePath === undefined ? {} : { fileRoutePath }),
    ...(component === undefined ? {} : { component }),
  };
}

/** Объявление маршрута из совпадения DECLARATION (n — номер в файле для ключа без имени). */
function declarationOf(m: RegExpMatchArray, n: number, file: string, source: string, imports: ReadonlyMap<string, string>): Declared {
  const at = m.index ?? 0;
  const props = callProps(source, at + m[0].length - 1);
  return {
    key: m[1] ?? `${file}#${n}`,
    file,
    parent: parentOf(props.get('getParentRoute')),
    isRoot: (m[2] ?? '').startsWith('createRoot'),
    ...routeWhere(props, m[3], componentOfDecl(props, file, source, imports)),
    redirects: redirectsOf(props.get('beforeLoad') ?? ''),
    line: lineAt(source, at),
  };
}

/** Локальные модули, которые импортирует файл (статически и через import()). */
function localImports(file: string, files: ReadonlyMap<string, string>): string[] {
  const src = files.get(file) ?? '';
  const specs = [...src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'`](\.[^"'`]+)["'`]/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  return [...new Set(specs.flatMap((s) => resolveModule(file, s, files) ?? []))];
}

/** Глубина обхода импортов экрана: маршрут → страница → виджет → строка. */
const IMPORT_DEPTH = 3;

/** Число объявлений маршрутов-экранов в каждом файле. */
type PerFile = ReadonlyMap<string, number>;

/** Экран сам даёт переходы: компонент известен и это не файл с многими маршрутами (routes.tsx). */
function ownsLinks(r: TanStackRoute, perFile: PerFile): r is TanStackRoute & { readonly componentFile: string } {
  return r.componentFile !== undefined && !(r.componentFile === r.file && (perFile.get(r.file) ?? 0) > 1);
}

/** Компонент и его локальные импорты до IMPORT_DEPTH (файлы с многими маршрутами — мимо). */
function reachableFiles(start: string, files: ReadonlyMap<string, string>, perFile: PerFile): Set<string> {
  const seen = new Set<string>([start]);
  let frontier = [start];
  for (let depth = 0; depth < IMPORT_DEPTH; depth++) {
    frontier = frontier.flatMap((f) => localImports(f, files)).filter((f) => !seen.has(f) && (perFile.get(f) ?? 0) <= 1);
    frontier.forEach((f) => seen.add(f));
  }
  return seen;
}

/**
 * Файлы экрана: компонент и его локальные импорты до IMPORT_DEPTH. Файлы,
 * которые тянет больше четверти экранов (оболочка, меню, общие таблицы),
 * отброшены: их ссылки — не переходы конкретного экрана.
 */
function filesOfScreens(routes: readonly TanStackRoute[], files: ReadonlyMap<string, string>, perFile: PerFile): Map<string, string[]> {
  const reach = new Map(routes.filter((r) => ownsLinks(r, perFile)).map((r) => [r.fullPath, reachableFiles(r.componentFile ?? '', files, perFile)]));
  const usage = new Map<string, number>();
  for (const f of [...reach.values()].flatMap((set) => [...set])) {
    usage.set(f, (usage.get(f) ?? 0) + 1);
  }
  const limit = Math.max(3, Math.floor(reach.size / 4));
  return new Map([...reach].map(([screen, set]) => [screen, [...set].filter((f) => (usage.get(f) ?? 0) <= limit)]));
}

function joinPath(parent: string, child: string): string {
  const joined = `${parent.replace(/\/+$/, '')}/${child.replace(/^\/+/, '')}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : '/';
}

/** Путь файлового маршрута без служебных сегментов (_layout, (group)) и хвостового «/». */
function fileRouteFullPath(p: string): string {
  const segs = p.split('/').filter((s) => s !== '' && !s.startsWith('_') && !/^\(.*\)$/.test(s));
  return `/${segs.join('/')}`;
}

/** Объявления и поиск родителя: сначала в том же файле, потом по имени где угодно. */
type DeclIndex = { readonly decls: readonly Declared[]; readonly byKey: ReadonlyMap<string, Declared>; readonly fullPaths: Map<Declared, string> };

function findDecl(index: DeclIndex, file: string, key: string): Declared | undefined {
  return index.byKey.get(`${file}::${key}`) ?? index.decls.find((d) => d.key === key);
}

/** Полный путь объявления: файловый — из пути, корень — «/», иначе путь родителя + свой (глубина до 50). */
function fullPathOf(index: DeclIndex, d: Declared, depth = 0): string {
  const cached = index.fullPaths.get(d);
  if (cached !== undefined) {
    return cached;
  }
  const full = computeFullPath(index, d, depth);
  index.fullPaths.set(d, full);
  return full;
}

function computeFullPath(index: DeclIndex, d: Declared, depth: number): string {
  if (d.fileRoutePath !== undefined) {
    return fileRouteFullPath(d.fileRoutePath);
  }
  if (d.isRoot || depth > 50) {
    return '/';
  }
  const parent = d.parent === null ? undefined : findDecl(index, d.file, d.parent);
  return joinPath(parent === undefined ? '/' : fullPathOf(index, parent, depth + 1), d.path ?? '');
}

/** Файл компонента от корня приложения: тот же файл или разрешённый модуль. */
function componentOf(d: Declared, files: ReadonlyMap<string, string>): string | undefined {
  if (d.component === undefined) {
    return undefined;
  }
  return d.component === d.file ? d.file : resolveModule(d.file, d.component, files);
}

/** Маршруты-экраны без повторов полного пути (первый выигрывает). */
function routesOf(index: DeclIndex, screens: readonly Declared[], files: ReadonlyMap<string, string>): TanStackRoute[] {
  const byPath = new Map<string, TanStackRoute>();
  for (const d of screens) {
    const fullPath = fullPathOf(index, d);
    if (!byPath.has(fullPath)) {
      const componentFile = componentOf(d, files);
      byPath.set(fullPath, { key: d.key, fullPath, file: d.file, ...(componentFile === undefined ? {} : { componentFile }), redirects: d.redirects, line: d.line });
    }
  }
  return [...byPath.values()];
}

/** Переходы redirect маршрута на известные экраны (не на себя). */
function redirectLinks(r: TanStackRoute, known: ReadonlySet<string>): TanStackLink[] {
  return r.redirects
    .filter((to) => known.has(to) && to !== r.fullPath)
    .map((to) => ({ fromPath: r.fullPath, toPath: to, kind: 'redirect', file: r.file, line: r.line, shared: false }));
}

/** Переходы Link/navigate из файлов экрана на известные экраны (не на себя). */
function componentLinks(r: TanStackRoute, screenFiles: ReadonlyMap<string, string[]>, files: ReadonlyMap<string, string>, known: ReadonlySet<string>): TanStackLink[] {
  return (screenFiles.get(r.fullPath) ?? []).flatMap((f) => {
    const shared = [...screenFiles.values()].filter((list) => list.includes(f)).length > 1;
    return linkTargetsAt(files.get(f) ?? '').flatMap(({ to, line }): TanStackLink[] => {
      const target = to.length > 1 ? to.replace(/\/$/, '') : to;
      return known.has(target) && target !== r.fullPath ? [{ fromPath: r.fullPath, toPath: target, kind: 'link', file: f, line, shared }] : [];
    });
  });
}

/**
 * Маршруты и переходы TanStack Router из исходников приложения.
 *
 * @param files - путь от корня приложения → текст файла
 */
export function parseTanStackRoutes(files: ReadonlyMap<string, string>): { routes: TanStackRoute[]; links: TanStackLink[] } {
  const decls = [...files].filter(([, src]) => src.includes('@tanstack/react-router')).flatMap(([f, src]) => declarationsIn(f, src));
  const index: DeclIndex = { decls, byKey: new Map(decls.map((d) => [`${d.file}::${d.key}`, d])), fullPaths: new Map() };
  // Экран — маршрут с путём (не корень и не безпутевая обёртка с id).
  const screens = decls.filter((d) => !d.isRoot && (d.path !== undefined || d.fileRoutePath !== undefined));
  const routes = routesOf(index, screens, files);
  const known = new Set(routes.map((r) => r.fullPath));
  const perFile = new Map<string, number>();
  for (const d of screens) {
    perFile.set(d.file, (perFile.get(d.file) ?? 0) + 1);
  }
  const screenFiles = filesOfScreens(routes, files, perFile);
  // Файл со многими маршрутами (routes.tsx) — не источник переходов одного экрана.
  const links = routes.flatMap((r) => [...redirectLinks(r, known), ...(ownsLinks(r, perFile) ? componentLinks(r, screenFiles, files, known) : [])]);
  return { routes, links };
}

/**
 * TanStack путь → единый pathPattern: $id → [id], $ → [...rest].
 *
 * @param p - путь TanStack
 */
export function tanstackToPattern(p: string): string {
  return p
    .split('/')
    .map((seg) => (seg === '$' ? '[...rest]' : seg.startsWith('$') ? `[${seg.slice(1)}]` : /^\{-\$(\w+)\}$/.test(seg) ? `[${seg.slice(3, -1)}]` : seg))
    .join('/');
}
