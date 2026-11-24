/**
 * Каталог карт визуализатора: `GET /maps/index.json`.
 *
 * Файл собирает dev-сервер (`build-map-catalog-fs`) из всех
 * `public/maps/*.liveappmap.json` — любая карта в папке появляется в UI
 * без правки кода. Здесь — тип записи, разбор на границе и fetch.
 */
import { fetchJsonFile } from './load-error';

/** Путь каталога относительно origin визуализатора. */
export const MAP_CATALOG_URL = '/maps/index.json';

/** Суффикс файлов карт, попадающих в каталог. */
export const MAP_FILE_SUFFIX = '.liveappmap.json';

/** Версия формата `index.json`. */
export const MAP_CATALOG_VERSION = 1;

/** Карта в каталоге. */
export type MapCatalogEntry = {
  /** Имя файла без `.liveappmap.json` (`live-app-map`) или имя проекта (`korbor`). */
  readonly id: string;
  /** Подпись в селекте. */
  readonly label: string;
  /** URL JSON карты (`/maps/live-app-map.liveappmap.json`, `/__lam_project/map.json`). */
  readonly path: string;
  /** Dev-сервер приложения; пустая строка — карта без baseUrl. */
  readonly baseUrl: string;
  /** Число экранов (0, если карту не удалось разобрать). */
  readonly pageCount: number;
};

/** Файл, не попавший в каталог, и причина. */
export type SkippedMapFile = {
  readonly file: string;
  readonly reason: string;
};

/** Содержимое `/maps/index.json`. */
export type MapCatalog = {
  readonly version: number;
  readonly maps: readonly MapCatalogEntry[];
  readonly skipped: readonly SkippedMapFile[];
};

/** Результат загрузки каталога. */
export type FetchMapCatalogResult =
  | { readonly ok: true; readonly catalog: MapCatalog }
  | { readonly ok: false; readonly error: string };

/** Что известно о карте из её JSON (без привязки к файловой системе). */
export type MapFileSummary = {
  readonly fileName: string;
  readonly appName: string | null;
  readonly baseUrl: string | null;
  readonly pageCount: number;
};

/**
 * id карты по имени файла.
 *
 * @param fileName - `live-app-map.liveappmap.json`
 * @returns `live-app-map`
 */
export function mapIdFromFileName(fileName: string): string {
  return fileName.endsWith(MAP_FILE_SUFFIX)
    ? fileName.slice(0, -MAP_FILE_SUFFIX.length)
    : fileName;
}

/**
 * Запись каталога для файла `public/maps`: подпись — имя приложения из карты, адрес — из карты.
 *
 * @param summary - что прочитано из файла
 */
export function buildMapCatalogEntry(summary: MapFileSummary): MapCatalogEntry {
  const id = mapIdFromFileName(summary.fileName);
  return {
    id,
    label: summary.appName ?? id,
    path: `/maps/${summary.fileName}`,
    baseUrl: summary.baseUrl ?? '',
    pageCount: summary.pageCount,
  };
}

/**
 * Порядок по id.
 *
 * @param entries - записи в любом порядке
 */
export function sortMapCatalog(
  entries: readonly MapCatalogEntry[],
): readonly MapCatalogEntry[] {
  return [...entries].sort((a, b) => a.id.localeCompare(b.id));
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseEntry(v: unknown): MapCatalogEntry | null {
  if (!isRecord(v)) {
    return null;
  }
  const { id, label, path, baseUrl, pageCount } = v;
  if (typeof id !== 'string' || id === '' || typeof label !== 'string' || typeof baseUrl !== 'string') {
    return null;
  }
  return isMapPath(path) && isCount(pageCount) ? { id, label, path, baseUrl, pageCount } : null;
}

function isMapPath(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('/');
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseSkipped(v: unknown): SkippedMapFile | null {
  if (!isRecord(v) || typeof v['file'] !== 'string' || typeof v['reason'] !== 'string') {
    return null;
  }
  return { file: v['file'], reason: v['reason'] };
}

/**
 * Разбор `index.json` на границе: битые записи отбрасываются целиком.
 *
 * @param raw - JSON ответа
 * @returns каталог или текст ошибки
 */
export function parseMapCatalog(raw: unknown): FetchMapCatalogResult {
  if (!isRecord(raw) || !Array.isArray(raw['maps'])) {
    return { ok: false, error: 'Каталог карт: нет массива maps' };
  }
  if (raw['version'] !== MAP_CATALOG_VERSION) {
    return {
      ok: false,
      error: `Каталог карт: версия ${String(raw['version'])}, ожидается ${MAP_CATALOG_VERSION}`,
    };
  }
  const maps: MapCatalogEntry[] = [];
  for (const item of raw['maps']) {
    const entry = parseEntry(item);
    if (entry === null) {
      return { ok: false, error: `Каталог карт: битая запись ${JSON.stringify(item)}` };
    }
    maps.push(entry);
  }
  const skippedRaw = Array.isArray(raw['skipped']) ? raw['skipped'] : [];
  const skipped = skippedRaw
    .map(parseSkipped)
    .filter((s): s is SkippedMapFile => s !== null);
  return { ok: true, catalog: { version: MAP_CATALOG_VERSION, maps, skipped } };
}

/**
 * Загружает каталог карт с dev/preview-сервера.
 *
 * @param fetchFn - fetch (подменяется в тестах)
 * @param url - адрес каталога
 */
export async function fetchMapCatalog(
  fetchFn: typeof fetch = fetch,
  url: string = MAP_CATALOG_URL,
): Promise<FetchMapCatalogResult> {
  const r = await fetchJsonFile('Каталог карт', url, fetchFn, { cache: 'no-store' });
  return r.ok ? parseMapCatalog(r.json) : r;
}
