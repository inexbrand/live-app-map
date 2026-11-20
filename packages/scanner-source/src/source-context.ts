/**
 * Общий контекст скана: программа TypeScript, пути, реестр таблиц.
 */
import path from 'node:path';
import ts from 'typescript';
import type { SourceLocation } from '@live-app-map/schema';
import type { ImplementationIndex } from './implementations';

/** Контекст, который разделяют сборщики роутов, символов и вызовов БД. */
export type SourceContext = {
  readonly root: string;
  readonly checker: ts.TypeChecker;
  /** Имена переменных-таблиц Drizzle. */
  readonly drizzleTables: ReadonlySet<string>;
  /** Модели Prisma: имя в нижнем регистре → имя модели. */
  readonly prismaModels: ReadonlyMap<string, string>;
  /** Реализации интерфейсов (репозитории, порты). */
  readonly implementations: ImplementationIndex;
};

/**
 * Путь файла относительно корня, в POSIX-виде.
 *
 * @param root - корень скана
 * @param absFile - абсолютный путь
 * @returns относительный путь
 */
export function relPath(root: string, absFile: string): string {
  return path.relative(root, absFile).split(path.sep).join('/');
}

/**
 * Место узла: файл относительно корня и строка начала (без комментариев).
 *
 * @param ctx - контекст
 * @param node - узел
 * @returns SourceLocation
 */
export function locationOf(ctx: SourceContext, node: ts.Node): SourceLocation {
  const sf = node.getSourceFile();
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  return { file: relPath(ctx.root, sf.fileName), line };
}

/**
 * Символ под узлом с раскрытием импорта до исходного объявления.
 *
 * @param checker - type checker
 * @param node - идентификатор или выражение
 * @returns символ или undefined
 */
export function resolvedSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const sym = checker.getSymbolAtLocation(node);
  if (sym === undefined) {
    return undefined;
  }
  if ((sym.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(sym);
  }
  return sym;
}

/**
 * Файл узла лежит внутри корня скана и не является .d.ts / node_modules.
 *
 * @param ctx - контекст
 * @param node - узел объявления
 * @returns true для файлов проекта
 */
export function isProjectNode(ctx: SourceContext, node: ts.Node): boolean {
  const file = node.getSourceFile().fileName;
  return (
    !file.endsWith('.d.ts') &&
    !file.includes('/node_modules/') &&
    !relPath(ctx.root, file).startsWith('..')
  );
}
