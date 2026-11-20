/**
 * Скан исходников для CLI: команда `code` и опция `scan --code-dir`.
 */
import path from 'node:path';
import { assembleDocument } from '@live-app-map/scanner-core';
import { codeServiceNodes, scanSource } from '@live-app-map/scanner-source';
import { codeFileOfNode } from '@live-app-map/schema';
import type { AppMapDocument, AppMapEdge, CodeModel, Diagnostic } from '@live-app-map/schema';
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
  const root = path.resolve(codeDir);
  const screens = screenFiles(doc, root);
  const scan = scanSource({ root, entries: [...new Set(screens.values())] });
  const ids = new Set(doc.nodes.map((n) => n.id));
  const services = codeServiceNodes(scan.code).filter((n) => !ids.has(n.id));
  return {
    document: {
      ...doc,
      nodes: [...doc.nodes, ...services],
      edges: [...doc.edges, ...apiEdges(scan.code, screens)],
      code: scan.code,
    },
    diagnostics: scan.diagnostics,
  };
}

/**
 * Файлы экранов от корня исходников: id ноды → файл.
 *
 * @param doc - карта экранов
 * @param codeRoot - абсолютный каталог исходников
 * @returns ноды, чей файл лежит внутри каталога исходников
 */
function screenFiles(doc: AppMapDocument, codeRoot: string): Map<string, string> {
  const out = new Map<string, string>();
  const projectRoot = path.resolve(doc.project.root);
  for (const n of doc.nodes) {
    const file = n.source?.file === undefined ? null : codeFileOfNode(projectRoot, codeRoot, n.source.file);
    if (file !== null) {
      out.set(n.id, file);
    }
  }
  return out;
}

/**
 * Рёбра «экран → сервис»: по одному на пару, в metadata — id вызываемых роутов.
 *
 * @param code - раздел code с экранами и вызовами
 * @param screens - id ноды → файл экрана
 * @returns рёбра kind 'api'
 */
export function apiEdges(code: CodeModel, screens: ReadonlyMap<string, string>): AppMapEdge[] {
  const calls = new Map((code.apiCalls ?? []).map((c) => [c.id, c]));
  const routes = new Map(code.routes.map((r) => [r.id, r]));
  const byFile = new Map((code.screens ?? []).map((s) => [s.file, s]));
  const edges: AppMapEdge[] = [];
  for (const [nodeId, file] of screens) {
    const perService = new Map<string, Set<string>>();
    for (const sc of byFile.get(file)?.calls ?? []) {
      const routeId = calls.get(sc.callId)?.routeId;
      const route = routeId === undefined ? undefined : routes.get(routeId);
      if (route !== undefined) {
        perService.set(route.serviceId, (perService.get(route.serviceId) ?? new Set()).add(route.id));
      }
    }
    for (const [serviceId, routeIds] of perService) {
      edges.push({
        id: `api:${nodeId}->${serviceId}`,
        from: nodeId,
        to: serviceId,
        kind: 'api',
        confidence: 'medium',
        label: `API: ${routeIds.size}`,
        metadata: { routeIds: [...routeIds].sort() },
      });
    }
  }
  return edges;
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