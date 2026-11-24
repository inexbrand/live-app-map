/**
 * `GET /__lam_snapshot?url=<адрес шлюза>&w=&h=[&refresh=1]` — JPEG-снимок
 * экрана для замороженной ноды. Снимаются только адреса шлюза: сервер не
 * ходит по произвольным URL.
 */
import { readFileSync } from 'node:fs';
import { appMapStateStepSchema, type AppMapStateStep } from '@live-app-map/schema';
import { z } from 'zod';
import { isLocalOrigin, requestPath, sendError, type DevMiddleware } from '../dev-http';
import { parseGatewayHost } from './gateway-host';
import { isValidSnapshotSize, type SnapshotService } from './snapshot-service';
import { SNAPSHOT_PATH } from './snapshot-url';

/**
 * Проверяет запрос снимка.
 *
 * @param query - query запроса
 * @param gatewayPort - порт шлюза
 * @returns запрос или текст ошибки
 */
export function parseSnapshotQuery(
  query: URLSearchParams,
  gatewayPort: number,
):
  | { readonly ok: true; readonly url: string; readonly width: number; readonly height: number; readonly refresh: boolean; readonly steps: readonly AppMapStateStep[] }
  | { readonly ok: false; readonly error: string } {
  const raw = query.get('url') ?? '';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'url обязателен: адрес страницы через шлюз' };
  }
  if (u.protocol !== 'http:' || Number(u.port) !== gatewayPort || parseGatewayHost(u.host) === null) {
    return { ok: false, error: `снимаются только адреса шлюза :${gatewayPort}` };
  }
  const width = Number(query.get('w'));
  const height = Number(query.get('h'));
  if (!isValidSnapshotSize(width, height)) {
    return { ok: false, error: 'w и h — целые, от 200×120 до 4000×4000' };
  }
  const steps = parseSteps(query.get('steps'));
  if (steps === null) {
    return { ok: false, error: 'steps — JSON-массив шагов: [{"click":"text=Фильтры"}], {fill,value}, {press}, {waitFor}, {scroll}' };
  }
  return { ok: true, url: u.href, width, height, refresh: query.get('refresh') === '1', steps };
}

const stepsSchema = z.array(appMapStateStepSchema);

/** Шаги из query: нет — пусто; не разобрались — null. */
function parseSteps(raw: string | null): readonly AppMapStateStep[] | null {
  if (raw === null || raw === '') {
    return [];
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = stepsSchema.safeParse(v);
  return r.success ? r.data : null;
}

/**
 * Middleware снимков.
 *
 * @param service - сервис снимков
 * @param gatewayPort - порт шлюза
 */
export function createSnapshotMiddleware(service: SnapshotService, gatewayPort: number): DevMiddleware {
  return (req, res, next) => {
    if (requestPath(req) !== SNAPSHOT_PATH) {
      next();
      return;
    }
    if (!isLocalOrigin(req) || req.method !== 'GET') {
      sendError(res, 403, 'только GET со страницы визуализатора');
      return;
    }
    const parsed = parseSnapshotQuery(new URL(req.url ?? '', 'http://x').searchParams, gatewayPort);
    if (!parsed.ok) {
      sendError(res, 400, parsed.error);
      return;
    }
    service
      .get(parsed, parsed.refresh)
      .then((file) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'image/jpeg');
        res.setHeader('cache-control', 'private, max-age=60');
        res.end(readFileSync(file));
      })
      .catch((err: unknown) => {
        sendError(res, 502, `снимок не получился: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
      });
  };
}