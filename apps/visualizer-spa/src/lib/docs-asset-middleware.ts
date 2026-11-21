/**
 * GET /__lam_docs/asset?root=<каталог проекта>&path=<путь от корня> — картинка из
 * документации проекта (скриншоты эпох). Отдаются только картинки из каталогов `docs/`
 * внутри корня: путь с `..` за пределы корня и не-картинки — 400/404.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { rejectMethod, requestPath, sendError, type DevMiddleware } from './dev-http';
import { DOCS_ASSET_PATH } from './docs-asset-url';

const TYPES: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
]);

/** Абсолютный путь картинки или текст ошибки. */
function resolveAsset(root: string, file: string): { ok: true; abs: string; type: string } | { ok: false; status: number; error: string } {
  if (!path.isAbsolute(root) || file === '') {
    return { ok: false, status: 400, error: 'root — абсолютный каталог проекта, path — путь картинки от него' };
  }
  const abs = path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const type = TYPES.get(path.extname(abs).toLowerCase());
  if (rel.startsWith('..') || !(rel.startsWith('docs/') || rel.includes('/docs/')) || type === undefined) {
    return { ok: false, status: 400, error: 'отдаются только картинки из docs/ внутри root' };
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { ok: false, status: 404, error: `нет файла: ${rel}` };
  }
  return { ok: true, abs, type };
}

/** Middleware картинок документации. */
export const docsAssetMiddleware: DevMiddleware = (req, res, next) => {
  if (requestPath(req) !== DOCS_ASSET_PATH) {
    next();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rejectMethod(res, 'GET, HEAD', 'только GET');
    return;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const found = resolveAsset(params.get('root') ?? '', params.get('path') ?? '');
  if (!found.ok) {
    sendError(res, found.status, found.error);
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', found.type);
  res.setHeader('cache-control', 'no-cache');
  res.end(req.method === 'HEAD' ? undefined : readFileSync(found.abs));
};
