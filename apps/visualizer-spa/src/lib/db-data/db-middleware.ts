/**
 * Живые данные БД на dev-сервере визуализатора (Node), только локальный origin:
 * - `GET  /__lam_db/status`  — состояние подключения ({@link DbStatus}), всегда 200;
 * - `GET  /__lam_db/rows`    — страница строк ({@link RowsPage});
 * - `POST /__lam_db/changes` — пакет правок одной транзакцией ({@link ChangesResult}).
 *
 * Конфиг проекта перечитывается на каждый запрос (как `/__lam_project/config`): правка
 * `database` в config.ts или файла env видна без перезапуска.
 */
import { loadProjectConfig } from '@live-app-map/cli/project-config';
import { localEndpointMiddleware, readValidJson, rejectMethod, sendError, sendJson, underPath, type DevMiddleware } from '../dev-http';
import type { OpenProject } from '../project/project-server';
import { DB_DATA_PATH, dbChangesSchema, rowsQuerySchema, type DbStatus, type RowsQuery } from './contract';
import { applyChanges, dbErrorResponse, dbPool, pingDb, readRowsPage } from './db-ops';
import { resolveDbTarget, type DbTargetResult } from './db-target';

/** Предел тела пакета правок. */
export const MAX_CHANGES_BYTES = 5 * 1024 * 1024;

type Req = Parameters<DevMiddleware>[0];
type Res = Parameters<DevMiddleware>[1];

/** Настройки middleware: проект и окружение, где искать переменную адреса. */
export type DbDataOptions = {
  readonly project: OpenProject | null;
  readonly env: Readonly<Record<string, string | undefined>>;
};

async function targetOf(options: DbDataOptions): Promise<DbTargetResult | null> {
  if (options.project === null) {
    return null;
  }
  const config = await loadProjectConfig(options.project.root);
  return resolveDbTarget(config, options.project.root, options.env);
}

async function sendStatus(res: Res, target: DbTargetResult): Promise<void> {
  if (!target.ok) {
    sendJson(res, 200, target.off);
    return;
  }
  const t = target.target;
  try {
    await pingDb(dbPool(t.url));
  } catch (err: unknown) {
    const status: DbStatus = { state: 'error', message: dbErrorResponse(err).error };
    sendJson(res, 200, status);
    return;
  }
  const status: DbStatus = { state: 'ready', host: t.host, database: t.database, writable: t.writable, ...(t.readOnlyReason === undefined ? {} : { readOnlyReason: t.readOnlyReason }) };
  sendJson(res, 200, status);
}

/**
 * Query-параметры страницы: пустые необязательные — как отсутствующие,
 * кроме filterValue при заданной колонке (пустая строка — тоже значение).
 *
 * @param url - адрес запроса
 */
export function rowsQueryInput(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (v !== '' || (k === 'filterValue' && (url.searchParams.get('filterColumn') ?? '') !== '')) {
      out[k] = v;
    }
  }
  return out;
}

function parseRowsQuery(res: Res, url: URL): RowsQuery | null {
  const parsed = rowsQuerySchema.safeParse(rowsQueryInput(url));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    sendError(res, 400, `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'неверный запрос'} — нужны table, page, size`);
    return null;
  }
  return parsed.data;
}

async function handle(req: Req, res: Res, p: string, options: DbDataOptions): Promise<void> {
  const action = p.slice(DB_DATA_PATH.length);
  const method = req.method ?? '';
  const allow = action === '/changes' ? 'POST' : 'GET';
  if (action !== '/status' && action !== '/rows' && action !== '/changes') {
    sendError(res, 404, `нет такого действия: ${method} ${p}`);
    return;
  }
  if (method !== allow) {
    rejectMethod(res, allow, `${p}: только ${allow}`);
    return;
  }
  const target = await targetOf(options);
  if (target === null) {
    sendError(res, 404, 'проект не открыт: запустите bun run dev -- --project <каталог> или задайте LAM_PROJECT');
    return;
  }
  if (action === '/status') {
    await sendStatus(res, target);
    return;
  }
  if (!target.ok) {
    sendError(res, 409, `БД не подключена: ${target.off.reason}. ${target.off.hint}`);
    return;
  }
  try {
    await (action === '/rows' ? sendRows(req, res, target.target.url) : sendChanges(req, res, target));
  } catch (err: unknown) {
    const e = dbErrorResponse(err);
    sendError(res, e.status, e.error);
  }
}

async function sendRows(req: Req, res: Res, url: string): Promise<void> {
  const q = parseRowsQuery(res, new URL(req.url ?? '/', 'http://local'));
  if (q !== null) {
    sendJson(res, 200, await readRowsPage(dbPool(url), q));
  }
}

async function sendChanges(req: Req, res: Res, target: Extract<DbTargetResult, { ok: true }>): Promise<void> {
  const changes = await readValidJson(req, res, dbChangesSchema, MAX_CHANGES_BYTES);
  if (changes === null) {
    return;
  }
  if (!target.target.writable) {
    sendError(res, 403, `запись запрещена: ${target.target.readOnlyReason ?? 'хост БД не локальный'}`);
    return;
  }
  sendJson(res, 200, await applyChanges(dbPool(target.target.url), changes));
}

/**
 * Создаёт middleware живых данных БД.
 *
 * @param options - открытый проект и окружение с переменной адреса
 * @returns connect-middleware
 */
export function createDbDataMiddleware(options: DbDataOptions): DevMiddleware {
  return localEndpointMiddleware({
    matches: underPath(DB_DATA_PATH),
    errorStatus: 500,
    handle: (req, res, p) => handle(req, res, p, options),
  });
}

/**
 * Middleware для vite.config: окружение dev-сервера.
 *
 * @param project - открытый проект или null
 */
export function dbDataMiddleware(project: OpenProject | null): DevMiddleware {
  return createDbDataMiddleware({ project, env: process.env });
}
