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

/** Файлы, на которые ссылаются имена в import { A, B as C } from './x'. */
function importedFiles(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'`]([^"'`]+)["'`]/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const local = part.split(/\s+as\s+/).pop()?.trim().replace(/^type\s+/, '');
      if (local !== undefined && local !== '' && m[2] !== undefined) {
        out.set(local, m[2]);
      }
    }
  }
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*lazyRouteComponent\(\s*\(\)\s*=>\s*import\(\s*["'`]([^"'`]+)["'`]/g)) {
    if (m[1] !== undefined && m[2] !== undefined) {
      out.set(m[1], m[2]);
    }
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

function declarationsIn(file: string, source: string): Declared[] {
  const out: Declared[] = [];
  const imports = importedFiles(source);
  const componentFile = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const lazy = IMPORT_CALL.exec(value);
    if (lazy?.[1] !== undefined) return lazy[1];
    const ident = /^([A-Za-z_$][\w$]*)\s*$/.exec(value)?.[1];
    if (ident === undefined) return undefined;
    // Компонент объявлен в этом же файле — экран живёт здесь.
    return imports.get(ident) ?? (new RegExp(`function\\s+${ident}\\b|const\\s+${ident}\\s*=`).test(source) ? '.' : undefined);
  };
  const re = /(?:(?:const|let)\s+(\w+)\s*=\s*)?(createRootRouteWithContext\s*<[^>]*>\s*\(\s*\)|createRootRoute|createRoute|createFileRoute\s*\(\s*["'`]([^"'`]*)["'`]\s*\))\s*\(/g;
  for (const m of source.matchAll(re)) {
    const callee = m[2] ?? '';
    const open = (m.index ?? 0) + m[0].length - 1;
    const call = balancedFrom(source, open);
    const objStart = call.indexOf('{');
    const props = objStart < 0 ? new Map<string, string>() : topLevelProps(balancedFrom(call, objStart));
    const parentRaw = props.get('getParentRoute');
    const parent = parentRaw === undefined ? null : (/([A-Za-z_$][\w$]*)\s*\)?\s*$/.exec(parentRaw)?.[1] ?? null);
    const pathLit = STRING.exec(props.get('path') ?? '')?.[1];
    const comp = componentFile(props.get('component'));
    const resolvedComp = comp === '.' ? file : comp;
    const before = props.get('beforeLoad') ?? '';
    const redirects = [...before.matchAll(/redirect\(\s*\{[^}]*?\bto\s*:\s*["'`](\/[^"'`]*)["'`]/g)].flatMap((r) => (r[1] === undefined ? [] : [r[1]]));
    out.push({
      key: m[1] ?? `${file}#${out.length}`,
      file,
      parent,
      isRoot: callee.startsWith('createRoot'),
      ...(pathLit === undefined ? {} : { path: pathLit }),
      ...(m[3] === undefined ? {} : { fileRoutePath: m[3] }),
      ...(resolvedComp === undefined ? {} : { component: resolvedComp }),
      redirects,
      line: lineAt(source, m.index ?? 0),
    });
  }
  return out;
}

/** Локальные модули, которые импортирует файл (статически и через import()). */
function localImports(file: string, files: ReadonlyMap<string, string>): string[] {
  const src = files.get(file) ?? '';
  const specs = [...src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'`](\.[^"'`]+)["'`]/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  return [...new Set(specs.flatMap((s) => resolveModule(file, s, files) ?? []))];
}

/** Глубина обхода импортов экрана: маршрут → страница → виджет → строка. */
const IMPORT_DEPTH = 3;

/**
 * Файлы экрана: компонент и его локальные импорты до IMPORT_DEPTH. Файлы,
 * которые тянет больше четверти экранов (оболочка, меню, общие таблицы),
 * отброшены: их ссылки — не переходы конкретного экрана.
 */
function filesOfScreens(routes: readonly TanStackRoute[], files: ReadonlyMap<string, string>, perFile: ReadonlyMap<string, number>): Map<string, string[]> {
  const reach = new Map<string, Set<string>>();
  for (const r of routes) {
    if (r.componentFile === undefined || (r.componentFile === r.file && (perFile.get(r.file) ?? 0) > 1)) continue;
    const seen = new Set<string>([r.componentFile]);
    let frontier = [r.componentFile];
    for (let depth = 0; depth < IMPORT_DEPTH; depth++) {
      frontier = frontier.flatMap((f) => localImports(f, files)).filter((f) => !seen.has(f) && (perFile.get(f) ?? 0) <= 1);
      frontier.forEach((f) => seen.add(f));
    }
    reach.set(r.fullPath, seen);
  }
  const usage = new Map<string, number>();
  for (const set of reach.values()) for (const f of set) usage.set(f, (usage.get(f) ?? 0) + 1);
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

/**
 * Маршруты и переходы TanStack Router из исходников приложения.
 *
 * @param files - путь от корня приложения → текст файла
 */
export function parseTanStackRoutes(files: ReadonlyMap<string, string>): { routes: TanStackRoute[]; links: TanStackLink[] } {
  const decls = [...files].filter(([, src]) => src.includes('@tanstack/react-router')).flatMap(([f, src]) => declarationsIn(f, src));
  const byKey = new Map(decls.map((d) => [`${d.file}::${d.key}`, d]));
  const find = (file: string, key: string): Declared | undefined => byKey.get(`${file}::${key}`) ?? decls.find((d) => d.key === key);
  const fullCache = new Map<Declared, string>();
  const fullOf = (d: Declared, depth = 0): string => {
    const cached = fullCache.get(d);
    if (cached !== undefined) return cached;
    let full: string;
    if (d.fileRoutePath !== undefined) {
      full = fileRouteFullPath(d.fileRoutePath);
    } else if (d.isRoot || depth > 50) {
      full = '/';
    } else {
      const parent = d.parent === null ? undefined : find(d.file, d.parent);
      full = joinPath(parent === undefined ? '/' : fullOf(parent, depth + 1), d.path ?? '');
    }
    fullCache.set(d, full);
    return full;
  };
  // Экран — маршрут с путём (не корень и не безпутевая обёртка с id).
  const screens = decls.filter((d) => !d.isRoot && (d.path !== undefined || d.fileRoutePath !== undefined));
  const routes: TanStackRoute[] = [];
  const seen = new Set<string>();
  for (const d of screens) {
    const fullPath = fullOf(d);
    if (seen.has(fullPath)) continue;
    seen.add(fullPath);
    const componentFile = d.component === undefined ? undefined : d.component === d.file ? d.file : resolveModule(d.file, d.component, files);
    routes.push({ key: d.key, fullPath, file: d.file, ...(componentFile === undefined ? {} : { componentFile }), redirects: d.redirects, line: d.line });
  }
  const known = new Set(routes.map((r) => r.fullPath));
  const perFile = new Map<string, number>();
  for (const d of screens) perFile.set(d.file, (perFile.get(d.file) ?? 0) + 1);
  const screenFiles = filesOfScreens(routes, files, perFile);
  const links: TanStackLink[] = [];
  for (const r of routes) {
    for (const to of r.redirects) {
      if (known.has(to) && to !== r.fullPath) links.push({ fromPath: r.fullPath, toPath: to, kind: 'redirect', file: r.file, line: r.line, shared: false });
    }
    // Файл со многими маршрутами (routes.tsx) — не источник переходов одного экрана.
    if (r.componentFile === undefined || (r.componentFile === r.file && (perFile.get(r.file) ?? 0) > 1)) continue;
    for (const f of screenFiles.get(r.fullPath) ?? []) {
      const shared = [...screenFiles.values()].filter((list) => list.includes(f)).length > 1;
      for (const { to, line } of linkTargetsAt(files.get(f) ?? '')) {
        const target = to.length > 1 ? to.replace(/\/$/, '') : to;
        if (known.has(target) && target !== r.fullPath) links.push({ fromPath: r.fullPath, toPath: target, kind: 'link', file: f, line, shared });
      }
    }
  }
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
