/**
 * Сборка `public/maps/index.json` из файлов карт (Node, vite.config).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseAppMapDocument, parseLiveAppMapJson, type AppMapDocument } from '@live-app-map/schema';
import {
  MAP_CATALOG_VERSION,
  MAP_FILE_SUFFIX,
  buildMapCatalogEntry,
  sortMapCatalog,
  type MapCatalog,
  type MapCatalogEntry,
  type MapFileSummary,
  type SkippedMapFile,
} from './map-catalog';

/** Имя файла каталога внутри папки карт. */
export const MAP_CATALOG_FILE = 'index.json';

type SummaryResult =
  | { readonly ok: true; readonly summary: MapFileSummary }
  | { readonly ok: false; readonly reason: string };

/** Экраны карты: сервисы и внешние ссылки экранами не считаются. */
function screenCount(doc: AppMapDocument): number {
  return doc.nodes.filter((n) => n.kind === 'page').length;
}

/**
 * Разбирает текст карты (viewer liveappmap или enterprise JSON).
 *
 * @param fileName - имя файла
 * @param text - содержимое
 */
export function summarizeMapFile(fileName: string, text: string): SummaryResult {
  const live = parseLiveAppMapJson(text);
  if (live.ok) {
    return { ok: true, summary: summaryOf(fileName, live.document.app?.name, live.document.baseUrl, liveAppMapToAppMap(live.document)) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const app = parseAppMapDocument(raw);
  if (app.ok) {
    return { ok: true, summary: summaryOf(fileName, app.document.project.name, app.document.baseUrl, app.document) };
  }
  return { ok: false, reason: live.errors[0]?.message ?? 'не карта Live App Map' };
}

function summaryOf(fileName: string, appName: string | undefined, baseUrl: string | null | undefined, doc: AppMapDocument): MapFileSummary {
  return { fileName, appName: appName ?? null, baseUrl: baseUrl ?? null, pageCount: screenCount(doc) };
}

/**
 * Каталог карт папки (без записи на диск).
 *
 * @param mapsDir - абсолютный путь `public/maps`
 */
export function buildMapCatalog(mapsDir: string): MapCatalog {
  if (!existsSync(mapsDir)) {
    return { version: MAP_CATALOG_VERSION, maps: [], skipped: [] };
  }
  const maps: MapCatalogEntry[] = [];
  const skipped: SkippedMapFile[] = [];
  const files = readdirSync(mapsDir).filter((f) => f.endsWith(MAP_FILE_SUFFIX)).sort();
  for (const fileName of files) {
    const res = summarizeMapFile(fileName, readFileSync(path.join(mapsDir, fileName), 'utf8'));
    if (res.ok) {
      maps.push(buildMapCatalogEntry(res.summary));
    } else {
      skipped.push({ file: fileName, reason: res.reason });
    }
  }
  return { version: MAP_CATALOG_VERSION, maps: sortMapCatalog(maps), skipped };
}

/**
 * Собирает каталог и пишет `<mapsDir>/index.json`, только если он изменился
 * (повторный вызов не трогает файл и не будит watcher vite).
 *
 * @param mapsDir - абсолютный путь `public/maps`
 * @returns каталог
 */
export function writeMapCatalogIndex(mapsDir: string): MapCatalog {
  const catalog = buildMapCatalog(mapsDir);
  if (!existsSync(mapsDir)) {
    return catalog;
  }
  const file = path.join(mapsDir, MAP_CATALOG_FILE);
  const text = `${JSON.stringify(catalog, null, 2)}\n`;
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (prev !== text) {
    writeFileSync(file, text, 'utf8');
  }
  return catalog;
}