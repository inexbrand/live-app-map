/**
 * Сторона приложения: обработчик dev-входа на стандартных Request/Response.
 * Подключается одной строкой в любой сервер (Elysia, Bun.serve, Hono,
 * маршрут Next) и выдаёт сессии ролей через функции входа самого приложения.
 *
 * В production обработчик не отвечает никогда. Запрос не с этой машины
 * проходит только с секретом в заголовке {@link DEV_AUTH_SECRET_HEADER}.
 */
import {
  DEV_AUTH_PATH,
  DEV_AUTH_PROTOCOL,
  DEV_AUTH_SECRET_ENV,
  DEV_AUTH_SECRET_HEADER,
  roleProblem,
  sessionProblem,
  type DevAuthErrorResponse,
  type DevAuthRole,
  type DevAuthRoleInfo,
} from './protocol';

/** Настройки обработчика. */
export type DevAuthOptions = {
  /** Окружение приложения (process.env.NODE_ENV): «production» выключает вход. Пусто — ошибка. */
  readonly environment: string;
  /** Роли приложения; читаются на каждый запрос. */
  readonly roles: () => readonly DevAuthRole[] | Promise<readonly DevAuthRole[]>;
  /** Выключатель без перезапуска (например, флаг dev-инструментов); false — маршрутов нет. */
  readonly enabled?: () => boolean;
  /** Секрет для запросов не с этой машины; пусто — пускаются только запросы с loopback. */
  readonly secret?: string;
};

/**
 * Обработчик: ответ dev-входа или null, если запрос не к нему (или вход выключен).
 *
 * @param request - запрос
 * @param remoteAddress - адрес клиента (у Bun: server.requestIP(request)?.address)
 */
export type DevAuthHandler = (request: Request, remoteAddress: string) => Promise<Response | null>;

/**
 * Адрес этой же машины.
 *
 * @param address - IPv4 или IPv6
 */
export function isLoopbackAddress(address: string): boolean {
  const a = address.trim().toLowerCase();
  return a === '::1' || a.startsWith('127.') || a.startsWith('::ffff:127.');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function fail(status: number, body: DevAuthErrorResponse): Response {
  return json(status, body);
}

function info(role: DevAuthRole): DevAuthRoleInfo {
  return { id: role.id, label: role.label, origin: role.origin };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Роли приложения; негодная роль — ответ с ошибкой. */
async function readRoles(options: DevAuthOptions): Promise<readonly DevAuthRole[] | Response> {
  const roles = await options.roles();
  for (const role of roles) {
    const problem = roleProblem(role);
    if (problem !== null) {
      return fail(500, { error: problem, hint: 'исправьте список ролей, переданный в createDevAuthHandler' });
    }
  }
  return roles;
}

/** Поле role тела POST; нет — пусто. */
async function bodyRole(request: Request): Promise<string> {
  const body: unknown = await request.json().catch(() => null);
  const role = typeof body === 'object' && body !== null && 'role' in body ? body.role : '';
  return typeof role === 'string' ? role.trim() : '';
}

/** Выдача сессии роли из тела запроса. */
async function issue(request: Request, roles: readonly DevAuthRole[]): Promise<Response> {
  const roleId = await bodyRole(request);
  if (roleId === '') {
    return fail(400, { error: 'role обязателен: id роли из списка /roles', field: 'role' });
  }
  const role = roles.find((r) => r.id === roleId);
  if (role === undefined) {
    return fail(404, { error: `роли «${roleId}» нет`, hint: `есть: ${roles.map((r) => r.id).join(', ') || 'ни одной'}` });
  }
  let session;
  try {
    session = await role.issue();
  } catch (err) {
    return fail(502, { error: `вход роли «${role.id}» не выдан: ${messageOf(err)}` });
  }
  const problem = sessionProblem(role.id, session);
  return problem === null ? json(200, { protocol: DEV_AUTH_PROTOCOL, role: info(role), session }) : fail(500, { error: problem });
}

/** Отказ по доступу или null — можно. */
function accessDenied(request: Request, remoteAddress: string, secret: string): Response | null {
  if (isLoopbackAddress(remoteAddress)) {
    return null;
  }
  if (secret !== '' && request.headers.get(DEV_AUTH_SECRET_HEADER) === secret) {
    return null;
  }
  return fail(403, {
    error: 'dev-вход доступен только с этой машины',
    hint: `с другой машины: задайте ${DEV_AUTH_SECRET_ENV} у приложения и визуализатора (заголовок ${DEV_AUTH_SECRET_HEADER})`,
  });
}

/**
 * Создаёт обработчик dev-входа.
 *
 * @param options - окружение, роли, выключатель, секрет
 * @returns обработчик; в production всегда отвечает null
 * @throws Error если environment пуст
 */
export function createDevAuthHandler(options: DevAuthOptions): DevAuthHandler {
  const environment = options.environment.trim();
  if (environment === '') {
    throw new Error('createDevAuthHandler: environment обязателен — передайте process.env.NODE_ENV («production» выключает вход)');
  }
  const secret = options.secret?.trim() ?? '';
  return async (request, remoteAddress) => {
    const path = new URL(request.url).pathname;
    if (environment === 'production' || (path !== DEV_AUTH_PATH && !path.startsWith(`${DEV_AUTH_PATH}/`)) || options.enabled?.() === false) {
      return null;
    }
    const denied = accessDenied(request, remoteAddress, secret);
    if (denied !== null) {
      return denied;
    }
    const roles = await readRoles(options).catch((err: unknown) => fail(500, { error: `список ролей не прочитан: ${messageOf(err)}` }));
    if (roles instanceof Response) {
      return roles;
    }
    const route = `${request.method} ${path.slice(DEV_AUTH_PATH.length)}`;
    if (route === 'GET /roles') {
      return json(200, { protocol: DEV_AUTH_PROTOCOL, roles: roles.map(info) });
    }
    if (route === 'POST /session') {
      return issue(request, roles);
    }
    return fail(404, { error: `${route} не поддерживается`, hint: `есть GET ${DEV_AUTH_PATH}/roles и POST ${DEV_AUTH_PATH}/session` });
  };
}
