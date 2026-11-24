/**
 * Версии карт для вида «Сравнение»:
 *
 * - GET  /__lam_maps/versions?id=<карта> — коммиты, менявшие файл карты;
 * - GET  /__lam_maps/version?id=<карта>&ref=<хеш> — карта из коммита (JSON);
 * - POST /__lam_maps/scan?id=<карта> — свежий скан во временный каталог (JSON).
 *
 * id — имя файла `<id>.liveappmap.json` в каталоге карт или id карты вне папки
 * (карта проекта — её файл map.json); другие файлы недоступны.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isLocalOrigin, requestPath, sendError, sendJson, type DevMiddleware } from './dev-http';
import { freshScan, listMapVersions, readMapVersion, type ScanRecipes } from './map-versions';

export const MAP_VERSIONS_PATH = '/__lam_maps/versions';
export const MAP_VERSION_PATH = '/__lam_maps/version';
export const MAP_SCAN_PATH = '/__lam_maps/scan';

const MAP_ID = /^[a-z0-9][a-z0-9._-]*$/i;

/** Отдаёт готовый JSON-текст карты. */
function sendMapText(res: Parameters<DevMiddleware>[1], text: string): void {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}

/** Файл карты каталога по id; нет id или карты — статус и текст ошибки. */
function mapFileOf(mapsDir: string, extraFiles: ReadonlyMap<string, string>, id: string | null): { readonly id: string; readonly file: string } | { readonly status: number; readonly error: string } {
  if (id === null || id === '') {
    return { status: 400, error: 'не задан id карты — например, live-app-map' };
  }
  const file = extraFiles.get(id) ?? path.join(mapsDir, `${id}.liveappmap.json`);
  return !MAP_ID.test(id) || !existsSync(file) ? { status: 404, error: `карты ${id} нет в каталоге` } : { id, file };
}

/** Скан карты; повторный запрос во время скана ждёт тот же. */
function sharedScan(scans: Map<string, ReturnType<typeof freshScan>>, id: string, recipes: ScanRecipes): ReturnType<typeof freshScan> {
  const running = scans.get(id) ?? freshScan(id, recipes).finally(() => scans.delete(id));
  scans.set(id, running);
  return running;
}

/** Список версий карты в git или текст одной версии (ref). */
function sendVersions(res: Parameters<DevMiddleware>[1], p: string, file: string, ref: string | null): void {
  if (p === MAP_VERSIONS_PATH) {
    void listMapVersions(file).then((r) => sendJson(res, r.ok ? 200 : 502, r));
    return;
  }
  void readMapVersion(file, ref ?? '').then((r) => (r.ok ? sendMapText(res, r.stdout) : sendError(res, 400, r.error)));
}

/** Скан — только POST с локальной страницы; ответ — свежая карта или 502. */
function startScan(req: Parameters<DevMiddleware>[0], res: Parameters<DevMiddleware>[1], scan: () => ReturnType<typeof freshScan>): void {
  if (req.method !== 'POST' || !isLocalOrigin(req)) {
    sendError(res, req.method !== 'POST' ? 405 : 403, 'скан — POST с локальной страницы');
    return;
  }
  void scan().then((r) => (r.ok ? sendMapText(res, r.stdout) : sendError(res, 502, r.error)));
}

/**
 * Middleware версий карт.
 *
 * @param mapsDir - каталог `*.liveappmap.json` (public/maps)
 * @param recipes - рецепты свежего скана
 * @param extraFiles - карты вне папки: id → файл (карта проекта)
 */
export function mapVersionsMiddleware(mapsDir: string, recipes: ScanRecipes, extraFiles: ReadonlyMap<string, string> = new Map()): DevMiddleware {
  /** Сканы в полёте по id: второй запрос ждёт тот же скан. */
  const scans = new Map<string, ReturnType<typeof freshScan>>();
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== MAP_VERSIONS_PATH && p !== MAP_VERSION_PATH && p !== MAP_SCAN_PATH) {
      next();
      return;
    }
    const q = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const map = mapFileOf(mapsDir, extraFiles, q.get('id'));
    if ('status' in map) {
      sendError(res, map.status, map.error);
      return;
    }
    if (p === MAP_SCAN_PATH) {
      startScan(req, res, () => sharedScan(scans, map.id, recipes));
      return;
    }
    sendVersions(res, p, map.file, q.get('ref'));
  };
}