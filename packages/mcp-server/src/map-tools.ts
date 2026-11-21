/**
 * Чтение карты (liveappmap или enterprise JSON) для MCP-tools.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildCodeIndex, type CodeIndex } from '@live-app-map/graph';
import {
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapJson,
  type AppMapDocument,
} from '@live-app-map/schema';

/** Экран карты в ответе tools. */
export type MapPageSummary = {
  readonly id: string;
  readonly title: string;
  readonly path: string | undefined;
  readonly url: string | undefined;
  readonly states: readonly unknown[] | undefined;
};

/** Карта, сведённая к списку экранов. */
export type LoadedMap = {
  readonly name: string | undefined;
  readonly baseUrl: string | undefined;
  readonly pages: readonly MapPageSummary[];
};

/**
 * Читает и разбирает файл карты.
 *
 * @param mapPath - путь к JSON (относительно cwd)
 * @returns экраны карты
 * @throws Error если файл не читается или не является картой
 */
export function loadMap(mapPath: string): LoadedMap {
  const text = readFileSync(path.resolve(mapPath), 'utf8');
  const asApp = parseAppMapDocument(JSON.parse(text));
  if (asApp.ok) {
    return {
      name: asApp.document.project.name,
      baseUrl: asApp.document.baseUrl ?? undefined,
      pages: asApp.document.nodes
        .filter((n) => n.kind === 'page')
        .map((n) => ({
          id: n.id,
          title: n.title,
          path: n.pathExample ?? n.pathPattern,
          url: n.url,
          states: n.states,
        })),
    };
  }
  const asLive = parseLiveAppMapJson(text);
  if (asLive.ok) {
    return {
      name: asLive.document.app?.name,
      baseUrl: asLive.document.baseUrl,
      pages: asLive.document.pages.map((p) => ({
        id: p.id,
        title: p.title,
        path: p.path,
        url: p.url,
        states: p.states,
      })),
    };
  }
  throw new Error(`не карта Live App Map: ${mapPath}`);
}

/**
 * Читает карту как документ AppMap (liveappmap переводится в него).
 *
 * @param mapPath - путь к JSON (относительно cwd)
 * @returns документ
 * @throws Error если файл не читается или не является картой
 */
export function loadMapDocument(mapPath: string): AppMapDocument {
  const text = readFileSync(path.resolve(mapPath), 'utf8');
  const asApp = parseAppMapDocument(JSON.parse(text));
  if (asApp.ok) {
    return asApp.document;
  }
  const asLive = parseLiveAppMapJson(text);
  if (asLive.ok) {
    return liveAppMapToAppMap(asLive.document);
  }
  throw new Error(`не карта Live App Map: ${mapPath}`);
}

/** Индекс code последней прочитанной карты: путь + mtime → индекс. */
const indexCache = new Map<string, { readonly mtimeMs: number; readonly index: CodeIndex }>();

/**
 * Индекс раздела code карты; перечитывает файл, только если он изменился.
 *
 * @param mapPath - путь к карте
 * @returns индекс
 * @throws Error если в карте нет раздела code
 */
export function loadCodeIndex(mapPath: string): CodeIndex {
  const abs = path.resolve(mapPath);
  const mtimeMs = statSync(abs).mtimeMs;
  const cached = indexCache.get(abs);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.index;
  }
  const doc = loadMapDocument(abs);
  if (doc.code === undefined) {
    throw new Error(`в карте нет раздела code: ${mapPath}. Пересоберите её со сканом исходников (scan --code-dir <корень репо>)`);
  }
  const index = buildCodeIndex(doc);
  indexCache.set(abs, { mtimeMs, index });
  return index;
}
