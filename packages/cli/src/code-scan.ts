/**
 * Скан исходников для CLI: команда `code` и опция `scan --code-dir`.
 */
import path from 'node:path';
import { assembleDocument } from '@live-app-map/scanner-core';
import { codeServiceNodes, scanSource } from '@live-app-map/scanner-source';
import type { AppMapDocument, Diagnostic } from '@live-app-map/schema';
import { writeMapFile, type MapFileFormat } from './write-map';

/** Опции команды `code`. */
export type CodeScanOptions = {
  readonly dir: string;
  readonly out?: string;
  readonly format?: MapFileFormat;
};

/** Результат скана исходников в виде карты. */
export type CodeScanResult = {
  readonly document: AppMapDocument;
  readonly diagnostics: readonly Diagnostic[];
  readonly ms: number;
};

/**
 * Добавляет к карте раздел code и ноды сервисов из каталога исходников.
 *
 * @param doc - карта экранов
 * @param codeDir - каталог исходников (может отличаться от project.root)
 * @returns карта с code и диагностика скана
 */
export function withSourceCode(
  doc: AppMapDocument,
  codeDir: string,
): { document: AppMapDocument; diagnostics: readonly Diagnostic[] } {
  const scan = scanSource({ root: codeDir });
  const ids = new Set(doc.nodes.map((n) => n.id));
  const services = codeServiceNodes(scan.code).filter((n) => !ids.has(n.id));
  return {
    document: { ...doc, nodes: [...doc.nodes, ...services], code: scan.code },
    diagnostics: scan.diagnostics,
  };
}

/**
 * Карта только из исходников: ноды service + раздел code.
 *
 * @param opts - каталог, файл вывода, формат
 * @returns документ и диагностика
 */
export function runCodeScan(opts: CodeScanOptions): CodeScanResult {
  const t0 = Date.now();
  const root = path.resolve(opts.dir);
  const scan = scanSource({ root });
  const base = assembleDocument({
    projectRoot: root,
    projectName: path.basename(root),
    framework: 'unknown',
    nodes: codeServiceNodes(scan.code),
    edges: [],
    generatorName: '@live-app-map/scanner-source',
  });
  const document: AppMapDocument = { ...base, code: scan.code };
  if (opts.out !== undefined) {
    writeMapFile(document, opts.out, opts.format);
  }
  return { document, diagnostics: scan.diagnostics, ms: Date.now() - t0 };
}
