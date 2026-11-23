/**
 * Сторона визуализатора: спросить у приложения роли и получить сессию роли.
 * fetch передаётся снаружи — шлюзу нужен свой (самоподписанный HTTPS dev-серверов).
 */
import {
  DEV_AUTH_PATH,
  DEV_AUTH_PROTOCOL,
  DEV_AUTH_SECRET_HEADER,
  roleProblem,
  sessionProblem,
  type DevAuthRoleInfo,
  type DevAuthSession,
} from './protocol';

/** fetch, которым ходить в приложение. */
export type DevAuthFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Как ходить в приложение. */
export type DevAuthClientOptions = {
  readonly fetch: DevAuthFetch;
  /** Секрет приложения; пусто — без заголовка (хватает loopback). */
  readonly secret: string;
  /** Предел ожидания ответа, мс. */
  readonly timeoutMs: number;
};

/** Роли приложения или почему их нет. */
export type DevAuthRolesResult =
  | { readonly ok: true; readonly roles: readonly DevAuthRoleInfo[] }
  /** absent — у приложения нет dev-входа (404, не JSON): это не сбой. */
  | { readonly ok: false; readonly absent: boolean; readonly error: string };

/** Сессия роли или ошибка. */
export type DevAuthIssueResult = { readonly ok: true; readonly role: DevAuthRoleInfo; readonly session: DevAuthSession } | { readonly ok: false; readonly error: string };

function headers(o: DevAuthClientOptions, extra: Record<string, string>): Record<string, string> {
  return o.secret === '' ? extra : { ...extra, [DEV_AUTH_SECRET_HEADER]: o.secret };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRoleInfo(v: unknown): DevAuthRoleInfo | null {
  if (!isRecord(v) || typeof v['id'] !== 'string' || typeof v['label'] !== 'string' || typeof v['origin'] !== 'string') {
    return null;
  }
  const role = { id: v['id'], label: v['label'], origin: v['origin'] };
  return roleProblem(role) === null ? role : null;
}

function asSession(v: unknown): DevAuthSession | null {
  if (!isRecord(v) || typeof v['expiresAt'] !== 'string') {
    return null;
  }
  const storage = isRecord(v['storage']) ? Object.fromEntries(Object.entries(v['storage']).filter((e): e is [string, string] => typeof e[1] === 'string')) : undefined;
  const cookies = Array.isArray(v['cookies']) ? v['cookies'].filter((c): c is string => typeof c === 'string') : undefined;
  return {
    expiresAt: v['expiresAt'],
    ...(storage === undefined ? {} : { storage }),
    ...(cookies === undefined ? {} : { cookies }),
    ...(typeof v['actor'] === 'string' ? { actor: v['actor'] } : {}),
  };
}

/** Текст ошибки из тела ответа приложения. */
function errorText(body: unknown, status: number): string {
  if (isRecord(body) && typeof body['error'] === 'string') {
    return typeof body['hint'] === 'string' ? `${body['error']} (${body['hint']})` : body['error'];
  }
  return `HTTP ${status}`;
}

/** Запрос к приложению: тело JSON или сбой сети. */
async function call(url: string, init: RequestInit, o: DevAuthClientOptions): Promise<{ status: number; body: unknown } | { error: string }> {
  try {
    const res = await o.fetch(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs) });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Роли приложения.
 *
 * @param origin - origin фронтенда или бэкенда (`/api` проксируется на бэкенд)
 * @param o - fetch, секрет, предел ожидания
 */
export async function fetchDevAuthRoles(origin: string, o: DevAuthClientOptions): Promise<DevAuthRolesResult> {
  const r = await call(`${origin}${DEV_AUTH_PATH}/roles`, { method: 'GET', headers: headers(o, { accept: 'application/json' }) }, o);
  if ('error' in r) {
    return { ok: false, absent: false, error: `${origin} не отвечает: ${r.error}` };
  }
  const body = r.body;
  const list = isRecord(body) && body['protocol'] === DEV_AUTH_PROTOCOL && Array.isArray(body['roles']) ? body['roles'] : null;
  if (r.status === 200 && list !== null) {
    const roles = list.map(asRoleInfo).filter((x) => x !== null);
    return { ok: true, roles };
  }
  // 404 или не JSON — у приложения просто нет dev-входа
  const absent = r.status === 404 || !isRecord(body);
  return { ok: false, absent, error: absent ? `у ${origin} нет dev-входа (${DEV_AUTH_PATH})` : errorText(body, r.status) };
}

/**
 * Сессия роли.
 *
 * @param origin - где нашлась роль (тот же адрес, что у {@link fetchDevAuthRoles})
 * @param roleId - id роли
 * @param o - fetch, секрет, предел ожидания
 */
export async function issueDevAuthSession(origin: string, roleId: string, o: DevAuthClientOptions): Promise<DevAuthIssueResult> {
  const r = await call(
    `${origin}${DEV_AUTH_PATH}/session`,
    { method: 'POST', headers: headers(o, { accept: 'application/json', 'content-type': 'application/json' }), body: JSON.stringify({ role: roleId }) },
    o,
  );
  if ('error' in r) {
    return { ok: false, error: `${origin} не отвечает: ${r.error}` };
  }
  const body = r.body;
  const role = isRecord(body) ? asRoleInfo(body['role']) : null;
  const session = isRecord(body) ? asSession(body['session']) : null;
  if (r.status !== 200 || role === null || session === null) {
    return { ok: false, error: errorText(body, r.status) };
  }
  const problem = sessionProblem(role.id, session);
  return problem === null ? { ok: true, role, session } : { ok: false, error: problem };
}

/**
 * Пора ли выдать сессию заново.
 *
 * @param expiresAt - срок сессии (ISO)
 * @param now - текущее время, мс
 * @param marginMs - запас до срока, мс
 */
export function isDevAuthExpired(expiresAt: string, now: number, marginMs: number): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t - marginMs <= now;
}
