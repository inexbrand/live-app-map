/**
 * GET /maps/live-app-map.liveappmap.json — карта самого live-app-map с корнем текущего клона.
 *
 * Карта лежит в public/maps и снята на машине, где её пересобирали: code.root и docs.root в ней —
 * чужой абсолютный путь. По нему не читаются скриншоты эпох (/__lam_docs/asset) и документация
 * с диска (/__lam_docs/live). Эта карта всегда про монорепо, из которого запущен визуализатор,
 * поэтому сервер подставляет его корень. Остальные карты отдаются как есть.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requestPath, sendJson, type DevMiddleware } from './dev-http';

/** Файл карты live-app-map в public/maps. */
export const SELF_MAP_FILE = 'live-app-map.liveappmap.json';

type Rooted = { root?: unknown };

/** Корень раздела заменяется, только если он есть. */
function withRoot(section: unknown, root: string): unknown {
  return typeof section === 'object' && section !== null && 'root' in section ? { ...(section as Rooted), root } : section;
}

/**
 * Middleware карты live-app-map.
 *
 * @param publicMapsDir - каталог public/maps
 * @param monorepoRoot - корень монорепо live-app-map
 * @returns connect-middleware
 */
export function selfMapMiddleware(publicMapsDir: string, monorepoRoot: string): DevMiddleware {
  const file = path.join(publicMapsDir, SELF_MAP_FILE);
  return (req, res, next) => {
    if (requestPath(req) !== `/maps/${SELF_MAP_FILE}` || (req.method !== 'GET' && req.method !== 'HEAD') || !existsSync(file)) {
      next();
      return;
    }
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    sendJson(res, 200, { ...doc, code: withRoot(doc['code'], monorepoRoot), docs: withRoot(doc['docs'], monorepoRoot) });
  };
}
