/**
 * Скан исходников каталога: сервисы, символы, роуты, вызовы БД, таблицы.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type ts from 'typescript';
import { DEFAULT_EXCLUDE, walkFiles } from '@live-app-map/scanner-core';
import type { ApiRoute, CodeModel, CodeSymbol, DbTable, Diagnostic } from '@live-app-map/schema';
import { indexImplementations } from './implementations';
import { indexServices } from './services';
import { createSourceProgram } from './program';
import { collectRoutes } from './routes';
import { relPath, type SourceContext } from './source-context';
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
    for (const r of collectRoutes(ctx, sf)) {
      routes.push({ ...r, id: routeId(`api:${service.name} ${r.method} ${r.path}`), serviceId: service.id });
    }
  }
  const tables: DbTable[] = foundTables.map(({ table, file }) => ({
    ...table,
    id: tableId(`table:${table.orm}:${table.exportName}`),
    serviceId: services.serviceOf(file).id,
  }));

  const usedServices = new Set(all.map((f) => services.serviceOf(f).id));
  return {
    code: {
      services: services.all.filter((s) => usedServices.has(s.id) && ownsFiles(s.root, all)),
      symbols: symbols.sort(byLocation),
      routes: routes.sort(byLocation),
      tables: tables.sort(byLocation),
    },
    diagnostics,
    stats: { files: projectFiles.length, ms: Date.now() - t0 },
  };
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
