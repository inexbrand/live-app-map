/**
 * Чтение карты (liveappmap или enterprise JSON) для MCP-tools.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAppMapDocument, parseLiveAppMapJson } from '@live-app-map/schema';

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
