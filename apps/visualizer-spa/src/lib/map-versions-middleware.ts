/**
 * Версии карт для вида «Сравнение»:
 *
 * - GET  /__lam_maps/versions?id=<карта> — коммиты, менявшие файл карты;
 * - GET  /__lam_maps/version?id=<карта>&ref=<хеш> — карта из коммита (JSON);
 * - POST /__lam_maps/scan?id=<карта> — свежий скан во временный каталог (JSON).
 *
 * id — имя файла `<id>.liveappmap.json` в каталоге карт; другие файлы недоступны.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isLocalOrigin, requestPath, sendJson, type DevMiddleware } from './dev-http';
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

/**
 * Middleware версий карт.
 *
 * @param mapsDir - каталог `*.liveappmap.json` (public/maps)
 * @param recipes - рецепты свежего скана
 */
export function mapVersionsMiddleware(mapsDir: string, recipes: ScanRecipes): DevMiddleware {
  /** Сканы в полёте по id: второй запрос ждёт тот же скан. */
  const scans = new Map<string, ReturnType<typeof freshScan>>();
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== MAP_VERSIONS_PATH && p !== MAP_VERSION_PATH && p !== MAP_SCAN_PATH) {
      next();
      return;
    }
    const q = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const id = q.get('id');
    if (id === null || id === '') {
      sendJson(res, 400, { ok: false, error: 'не задан id карты — например, korbor-all' });
      return;
    }
    const file = path.join(mapsDir, `${id}.liveappmap.json`);
    if (!MAP_ID.test(id) || !existsSync(file)) {
      sendJson(res, 404, { ok: false, error: `карты ${id} нет в каталоге` });
      return;
    }
    if (p === MAP_SCAN_PATH) {
      if (req.method !== 'POST' || !isLocalOrigin(req)) {
        sendJson(res, req.method !== 'POST' ? 405 : 403, { ok: false, error: 'скан — POST с локальной страницы' });
        return;
      }
      const running = scans.get(id) ?? freshScan(id, recipes).finally(() => scans.delete(id));
      scans.set(id, running);
      void running.then((r) => (r.ok ? sendMapText(res, r.stdout) : sendJson(res, 502, { ok: false, error: r.error })));
      return;
    }
    if (p === MAP_VERSIONS_PATH) {
      void listMapVersions(file).then((r) => sendJson(res, r.ok ? 200 : 502, r));
      return;
    }
    void readMapVersion(file, q.get('ref') ?? '').then((r) => (r.ok ? sendMapText(res, r.stdout) : sendJson(res, 400, { ok: false, error: r.error })));
  };
}
