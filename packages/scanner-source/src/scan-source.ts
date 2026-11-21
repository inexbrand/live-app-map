/**
 * Скан исходников каталога: сервисы, символы, роуты, вызовы БД, таблицы.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { DEFAULT_EXCLUDE, walkFiles } from '@live-app-map/scanner-core';
import type { ApiCall, ApiRoute, CodeModel, CodeSymbol, DbTable, Diagnostic, ScreenApi } from '@live-app-map/schema';
import { ApiCallFinder } from './api-calls';
import { matchRoute } from './api-match';
import { EnvFiles } from './env-files';
import { RoutePaths } from './route-factories';
import { routeSection, rrScreenRoots } from './rr-screens';
import { screensApiCalls, type ScreenWalk } from './screen-calls';
import { SectionDispatch } from './section-dispatch';
import { ValueEvaluator } from './value-evaluator';
import { indexImplementations } from './implementations';
import { indexServices, type ServiceIndex } from './services';
import { createSourceProgram } from './program';
import { collectRoutes } from './routes';
import { locationOf, relPath, type SourceContext } from './source-context';
import { collectSymbols } from './symbols';
import { collectDrizzleTables, mayDeclareDrizzleTables, type FoundTable } from './tables-drizzle';
import { parsePrismaSchema } from './tables-prisma';

/** Предел числа исходников по умолчанию. */
const DEFAULT_MAX_FILES = 5000;

const SOURCE_FILE = /\.(ts|tsx|mts|cts)$/;
const TEST_FILE = /(\.(test|spec|perf-test)\.[cm]?[jt]sx?$)|(^|\/)(e2e|__fixtures__|fixtures)\//;

/** Запрос скана исходников. */
export type SourceScanRequest = {
  /** Каталог проекта (корень монорепо или один сервис). */
  readonly root: string;
  /** Дополнительные исключения к стандартным (node_modules, dist, …). */
  readonly exclude?: readonly string[];
  /** Предел числа .ts/.tsx файлов; сверх него файлы пропускаются с диагностикой. */
  readonly maxFiles?: number;
  /** Экраны — для них считаются достижимые вызовы API (`code.screens`). */
  readonly entries?: readonly ScreenEntry[];
};

/** Экран для поиска его вызовов API. */
export type ScreenEntry = {
  /** Файл экрана от root; у React Router — файл конфига роутов. */
  readonly file: string;
  /** Нода карты. */
  readonly nodeId?: string;
  /** Путь роута React Router: по нему в конфиге ищется объект роута. */
  readonly routePath?: string;
  /**
   * Файл конфига маршрутов, если экран в своём файле (TanStack Router): из объекта
   * маршрута берутся `loader`/`beforeLoad` — данные экрана часто грузятся там.
   */
  readonly routeFile?: string;
};

/** Результат скана исходников. */
export type SourceScanResult = {
  readonly code: CodeModel;
  readonly diagnostics: readonly Diagnostic[];
  readonly stats: { readonly files: number; readonly ms: number };
};

/** Выдаёт уникальные id: повтор получает суффикс #2, #3 … */
function uniqueIds(): (base: string) => string {
  const used = new Map<string, number>();
  return (base) => {
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/** Сортировка по файлу и строке — стабильный вывод. */
function byLocation<T extends { readonly location: { readonly file: string; readonly line: number } }>(a: T, b: T): number {
  return a.location.file === b.location.file ? a.location.line - b.location.line : a.location.file < b.location.file ? -1 : 1;
}

/**
 * Сканирует исходники каталога через TypeScript compiler API.
 *
 * @param request - корень, исключения, предел файлов
 * @returns раздел code карты, диагностика, статистика
 */
export function scanSource(request: SourceScanRequest): SourceScanResult {
  const t0 = Date.now();
  const root = path.resolve(request.root);
  const diagnostics: Diagnostic[] = [];
  const all = walkFiles(root, { exclude: [...DEFAULT_EXCLUDE, ...(request.exclude ?? [])] }).filter(
    (f) => !TEST_FILE.test(f),
  );
  const services = indexServices(root, all);
  const maxFiles = request.maxFiles ?? DEFAULT_MAX_FILES;
  const candidates = all.filter((f) => SOURCE_FILE.test(f) && !f.endsWith('.d.ts'));
  if (candidates.length > maxFiles) {
    diagnostics.push({
      code: 'SOURCE_MAX_FILES',
      severity: 'warning',
      message: `Исходников ${candidates.length}, разобрано первые ${maxFiles}`,
      file: root,
      hint: 'Поднимите maxFiles или сузьте каталог / exclude',
    });
  }
  const sourceFiles = candidates.slice(0, maxFiles);

  const foundTables: { table: FoundTable; file: string }[] = [];
  for (const f of all.filter((x) => x.endsWith('.prisma'))) {
    for (const table of parsePrismaSchema(readFileSync(path.join(root, f), 'utf8'), f)) {
      foundTables.push({ table, file: f });
    }
  }

  const program = createSourceProgram(sourceFiles.map((f) => path.join(root, f)));
  const projectFiles: ts.SourceFile[] = sourceFiles
    .map((f) => program.getSourceFile(path.join(root, f)))
    .filter((sf): sf is ts.SourceFile => sf !== undefined);
  const baseCtx: SourceContext = {
    root,
    checker: program.getTypeChecker(),
    drizzleTables: new Set(),
    prismaModels: new Map(),
    implementations: indexImplementations(projectFiles),
  };
  for (const sf of projectFiles) {
    if (mayDeclareDrizzleTables(sf.text)) {
      for (const table of collectDrizzleTables(baseCtx, sf)) {
        foundTables.push({ table, file: relPath(root, sf.fileName) });
      }
    }
  }
  const ctx: SourceContext = {
    ...baseCtx,
    drizzleTables: new Set(foundTables.filter((t) => t.table.orm === 'drizzle').map((t) => t.table.exportName)),
    prismaModels: new Map(
      foundTables.filter((t) => t.table.orm === 'prisma').map((t) => [t.table.exportName.toLowerCase(), t.table.exportName]),
    ),
  };

  const env = new EnvFiles();
  const ev = new ValueEvaluator(ctx, (sf, name) =>
    env.basePath(path.join(root, services.serviceOf(relPath(root, sf.fileName)).root), name),
  );
  const routePaths = new RoutePaths(ev, projectFiles);
  const symbolId = uniqueIds();
  const routeId = uniqueIds();
  const tableId = uniqueIds();
  const symbols: CodeSymbol[] = [];
  const routes: ApiRoute[] = [];
  for (const sf of projectFiles) {
    const rel = relPath(root, sf.fileName);
    const service = services.serviceOf(rel);
    for (const s of collectSymbols(ctx, sf)) {
      symbols.push({ ...s, id: symbolId(`symbol:${rel}#${s.name}`), serviceId: service.id });
    }
    for (const r of collectRoutes(ctx, sf, routePaths)) {
      routes.push({ ...r, id: routeId(`api:${service.name} ${r.method} ${r.path}`), serviceId: service.id });
    }
  }
  const tables: DbTable[] = foundTables.map(({ table, file }) => ({
    ...table,
    id: tableId(`table:${table.orm}:${table.exportName}`),
    serviceId: services.serviceOf(file).id,
  }));

  const sortedRoutes = routes.sort(byLocation);
  const api = collectApiCalls(ctx, ev, projectFiles, services, sortedRoutes);
  const usedServices = new Set(all.map((f) => services.serviceOf(f).id));
  return {
    code: {
      root,
      services: services.all.filter((s) => usedServices.has(s.id) && ownsFiles(s.root, all)),
      symbols: symbols.sort(byLocation),
      routes: sortedRoutes,
      tables: tables.sort(byLocation),
      apiCalls: api.calls,
      ...(request.entries === undefined ? {} : { screens: screensOf(ctx, projectFiles, request.entries, api.idsByNode, services) }),
    },
    diagnostics,
    stats: { files: projectFiles.length, ms: Date.now() - t0 },
  };
}

/**
 * Вызовы API во всех файлах и их роуты.
 *
 * @param ctx - контекст
 * @param ev - вычислитель значений
 * @param files - исходники
 * @param services - сервисы
 * @param routes - роуты для сопоставления
 * @returns вызовы и индекс «узел вызова → id»
 */
function collectApiCalls(
  ctx: SourceContext,
  ev: ValueEvaluator,
  files: readonly ts.SourceFile[],
  services: ServiceIndex,
  routes: readonly ApiRoute[],
): { calls: ApiCall[]; idsByNode: Map<ts.Node, string[]> } {
  const finder = new ApiCallFinder(ev);
  const callId = uniqueIds();
  const calls: ApiCall[] = [];
  const idsByNode = new Map<ts.Node, string[]>();
  for (const sf of files) {
    const rel = relPath(ctx.root, sf.fileName);
    const serviceId = services.serviceOf(rel).id;
    for (const found of finder.collect(sf)) {
      const location = locationOf(ctx, found.node);
      const id = callId(`call:${rel}:${location.line} ${found.method} ${found.path}`);
      const route = matchRoute(found.method, found.path, routes);
      calls.push({
        id,
        serviceId,
        method: found.method,
        path: found.path,
        client: found.client,
        ...(found.via === undefined ? {} : { via: found.via }),
        location,
        ...(route === undefined ? {} : { routeId: route.id }),
      });
      idsByNode.set(found.node, [...(idsByNode.get(found.node) ?? []), id]);
    }
  }
  return { calls, idsByNode };
}

/** Счёт по ключу. */
function countBy<T>(items: readonly T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  }
  return m;
}

/**
 * Экраны и их вызовы API.
 *
 * Откуда начинается экран: файл (Next), объект роута в конфиге RR, а если его нет —
 * свой файл экрана (TanStack: файл страницы) или, для общего конфига-данных
 * (админка korbor), ветка switch по разделу пути.
 *
 * @param ctx - контекст
 * @param files - исходники проекта
 * @param entries - файлы экранов от root
 * @param idsByNode - узел вызова → id
 * @param services - сервисы
 * @returns экраны, найденные среди исходников
 */
function screensOf(
  ctx: SourceContext,
  files: readonly ts.SourceFile[],
  entries: readonly ScreenEntry[],
  idsByNode: ReadonlyMap<ts.Node, readonly string[]>,
  services: ServiceIndex,
): ScreenApi[] {
  const serviceOfAbs = (f: string): string => services.serviceOf(relPath(ctx.root, f)).id;
  const sameService = (a: string, b: string): boolean => serviceOfAbs(a) === serviceOfAbs(b);
  const byFile = new Map(files.map((sf) => [sf.fileName, sf]));
  const perFile = countBy(entries, (e) => e.file);
  // Свой файл экрана (один экран на файл) — в него обход других экранов не заходит.
  const screenFiles = new Set(entries.filter((e) => perFile.get(e.file) === 1).map((e) => path.join(ctx.root, e.file)));
  const sectionsByFile = new Map<string, Set<string>>();
  for (const e of entries) {
    const s = e.routePath === undefined ? undefined : routeSection(e.routePath);
    if (s !== undefined) {
      sectionsByFile.set(e.file, (sectionsByFile.get(e.file) ?? new Set()).add(s));
    }
  }
  let dispatch: SectionDispatch | undefined;
  const found: { entry: ScreenEntry; walk: ScreenWalk }[] = [];
  for (const e of entries) {
    const sf = byFile.get(path.join(ctx.root, e.file));
    if (sf === undefined) {
      continue;
    }
    let roots: ts.Node[] = e.routePath === undefined ? [sf] : rrScreenRoots(ctx, sf, e.routePath);
    if (roots.length === 0 && e.routePath !== undefined) {
      const section = routeSection(e.routePath);
      if ((perFile.get(e.file) ?? 0) > 1 && section !== undefined) {
        dispatch ??= new SectionDispatch(files);
        roots = dispatch.roots(section, sectionsByFile.get(e.file) ?? new Set(), (f) => sameService(f, sf.fileName));
      }
      // Свой файл экрана или файл страницы на несколько маршрутов без диспетчера.
      if (roots.length === 0) {
        roots = [sf];
      }
    }
    const routeSf = e.routeFile === undefined || e.routeFile === e.file ? undefined : byFile.get(path.join(ctx.root, e.routeFile));
    if (routeSf !== undefined && e.routePath !== undefined) {
      roots = [...roots, ...rrScreenRoots(ctx, routeSf, e.routePath)];
    }
    const skipFiles = new Set([...screenFiles].filter((f) => f !== sf.fileName));
    found.push({ entry: e, walk: { roots, skipFiles, serviceId: serviceOfAbs(sf.fileName) } });
  }
  const calls = screensApiCalls(ctx, found.map((f) => f.walk), idsByNode, sameService);
  return found.map(({ entry }, i) => ({
    ...(entry.nodeId === undefined ? {} : { nodeId: entry.nodeId }),
    file: entry.file,
    calls: calls[i] ?? [],
  }));
}

/**
 * У сервиса есть файлы помимо package.json (корневой package.json монорепо не сервис).
 */
function ownsFiles(serviceRoot: string, files: readonly string[]): boolean {
  if (serviceRoot !== '.') {
    return true;
  }
  return files.some((f) => !f.includes('/') && f !== 'package.json' && SOURCE_FILE.test(f));
}
