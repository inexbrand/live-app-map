/**
 * Скан исходников для CLI: команда `code` и опция `scan --code-dir`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assembleDocument } from '@live-app-map/scanner-core';
import { scanDocs } from '@live-app-map/scanner-docs';
import { codeServiceNodes, scanSource, type ScreenEntry } from '@live-app-map/scanner-source';
import { codeFileOfNode, screenOf } from '@live-app-map/schema';
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
 * Добавляет к карте раздел code, ноды сервисов и раздел docs (документация того же каталога).
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
  const scan = scanSource({ root, entries: screenEntries(doc, root) });
  return { document: { ...attachCode(doc, scan.code), docs: scanDocs(root) }, diagnostics: scan.diagnostics };
}

/**
 * Экраны карты как входы скана исходников: файл от корня исходников,
 * у React Router — ещё путь роута.
 *
 * @param doc - карта экранов
 * @param codeRoot - абсолютный каталог исходников
 * @param idPrefix - приставка к id ноды (для общей карты нескольких приложений)
 * @returns входы для scanSource
 */
export function screenEntries(doc: AppMapDocument, codeRoot: string, idPrefix = ''): ScreenEntry[] {
  const routerPaths = doc.project.framework === 'react-router';
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  return [...screenFiles(doc, codeRoot)].map(([nodeId, file]) => ({
    nodeId: `${idPrefix}${nodeId}`,
    file,
    ...(routerPaths ? { routePath: nodes.get(nodeId)?.pathPattern ?? '/' } : {}),
  }));
}

/**
 * Добавляет к карте раздел code: ноды сервисов и рёбра «экран → сервис».
 * Экраны раздела code должны ссылаться на id нод этой карты.
 *
 * @param doc - карта экранов
 * @param code - раздел code
 * @returns карта с кодом
 */
export function attachCode(doc: AppMapDocument, code: CodeModel): AppMapDocument {
  const screens = screenFiles(doc, code.root);
  const ids = new Set(doc.nodes.map((n) => n.id));
  const services = codeServiceNodes(code).filter((n) => !ids.has(n.id));
  return {
    ...doc,
    nodes: [...doc.nodes, ...services],
    edges: [...doc.edges, ...apiEdges(code, screens)],
    code,
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
  const edges: AppMapEdge[] = [];
  for (const [nodeId, file] of screens) {
    const perService = new Map<string, Set<string>>();
    for (const sc of screenOf(code, nodeId, file)?.calls ?? []) {
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
 * Имя проекта: поле name корневого package.json, иначе имя каталога
 * (каталог worktree часто назван не по проекту).
 *
 * @param root - каталог проекта
 * @returns имя
 */
function projectNameOf(root: string): string {
  const pkg = path.join(root, 'package.json');
  if (existsSync(pkg)) {
    const parsed: unknown = JSON.parse(readFileSync(pkg, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string' && parsed.name !== '') {
      return parsed.name;
    }
  }
  return path.basename(root);
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
    projectName: projectNameOf(root),
    framework: 'unknown',
    nodes: codeServiceNodes(scan.code),
    edges: [],
    generatorName: '@live-app-map/scanner-source',
  });
  const document: AppMapDocument = { ...base, code: scan.code, docs: scanDocs(root) };
  if (opts.out !== undefined) {
    writeMapFile(document, opts.out, opts.format);
  }
  return { document, diagnostics: scan.diagnostics, ms: Date.now() - t0 };
}