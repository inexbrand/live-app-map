/**
 * GET /maps/index.json — каталог карт из public/maps/*.liveappmap.json, собирается
 * при каждом запросе: любая карта в папке появляется в UI без перезапуска.
 * Карты вне папки (карта открытого проекта) идут первыми и в файл index.json не пишутся.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { withExtraMaps, writeMapCatalogIndex, type ExtraCatalogItems } from './build-map-catalog-fs';

const NO_EXTRA = (): ExtraCatalogItems => ({ maps: [], skipped: [] });

/**
 * Middleware каталога карт.
 *
 * @param mapsDir - каталог public/maps
 * @param extra - карты вне папки на момент запроса (карта проекта)
 * @returns connect-middleware; чужие пути — дальше
 */
export function mapsIndexMiddleware(mapsDir: string, extra: () => ExtraCatalogItems = NO_EXTRA): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    if ((req.url?.split('?')[0] ?? '') !== '/maps/index.json') {
      next();
      return;
    }
    try {
      const catalog = withExtraMaps(writeMapCatalogIndex(mapsDir), extra());
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(catalog, null, 2));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  };
}
