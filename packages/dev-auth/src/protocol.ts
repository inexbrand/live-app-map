/**
 * Протокол dev-входа Live App Map: приложение по известному адресу отдаёт
 * список ролей и выдаёт сессию роли. Визуализатор сам спрашивает роли у
 * каждого приложения карты и заводит профили входа без действий человека.
 *
 * Адрес лежит под `/api`: dev-серверы фронтендов обычно проксируют `/api`
 * на бэкенд, поэтому один бэкенд виден через origin каждого фронтенда.
 */

/** Версия протокола: меняется только при несовместимой правке ответов. */
export const DEV_AUTH_PROTOCOL = 1;

/** Корень маршрутов dev-входа в приложении. */
export const DEV_AUTH_PATH = '/api/lam-dev-auth';

/** Заголовок с секретом для запросов не с этой машины. */
export const DEV_AUTH_SECRET_HEADER = 'x-lam-dev-auth-secret';

/** Переменная окружения с секретом (и у приложения, и у визуализатора). */
export const DEV_AUTH_SECRET_ENV = 'LAM_DEV_AUTH_SECRET';

/** id роли: годится в имя хоста шлюза — строчные латинские буквы, цифры, дефис. */
export const ROLE_ID_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

/** Роль без функции выдачи — то, что видит визуализатор. */
export type DevAuthRoleInfo = {
  /** recruiter, employer, admin … — совпадает с ролью стейта экрана карты. */
  readonly id: string;
  /** Подпись для человека: «Рекрутер». */
  readonly label: string;
  /** Origin фронтенда, куда кладётся сессия: https://vite.localhost:5175. */
  readonly origin: string;
};

/** Сессия роли: что положить браузеру фронтенда до загрузки страницы. */
export type DevAuthSession = {
  /** Ключи sessionStorage → значения (токен, initData, CSRF). */
  readonly storage?: Readonly<Record<string, string>>;
  /** Заголовки Set-Cookie как их выдал бы обычный вход приложения. */
  readonly cookies?: readonly string[];
  /** Когда сессию надо выдать заново (ISO 8601). */
  readonly expiresAt: string;
  /** Под кем вошли — для подписи профиля: «ops@korbor», «tg:1001». */
  readonly actor?: string;
};

/** Роль с функцией выдачи — то, что передаёт приложение. */
export type DevAuthRole = DevAuthRoleInfo & {
  /** Выдаёт сессию через обычные функции входа приложения. Ошибка — текст для человека. */
  readonly issue: () => Promise<DevAuthSession>;
};

/** Ответ GET `${DEV_AUTH_PATH}/roles`. */
export type DevAuthRolesResponse = { readonly protocol: number; readonly roles: readonly DevAuthRoleInfo[] };

/** Ответ POST `${DEV_AUTH_PATH}/session`. */
export type DevAuthSessionResponse = { readonly protocol: number; readonly role: DevAuthRoleInfo; readonly session: DevAuthSession };

/** Ответ с ошибкой: текст и, если есть, что сделать. */
export type DevAuthErrorResponse = { readonly error: string; readonly hint?: string; readonly field?: string };

/**
 * Почему роль негодна; годна — null.
 *
 * @param role - роль от приложения
 */
export function roleProblem(role: DevAuthRoleInfo): string | null {
  if (!ROLE_ID_RE.test(role.id) || role.id.includes('--')) {
    return `id роли «${role.id}»: строчные латинские буквы, цифры, дефис (например recruiter)`;
  }
  if (role.label.trim() === '') {
    return `у роли «${role.id}» пустая подпись label`;
  }
  try {
    const u = new URL(role.origin);
    if (u.origin !== role.origin) {
      return `origin роли «${role.id}» — только схема, хост и порт: ${u.origin}`;
    }
  } catch {
    return `origin роли «${role.id}» не адрес: «${role.origin}» (нужно вида http://localhost:16002)`;
  }
  return null;
}

/**
 * Почему сессия негодна; годна — null.
 *
 * @param roleId - роль, для подписи ошибки
 * @param session - сессия от приложения
 */
export function sessionProblem(roleId: string, session: DevAuthSession): string | null {
  if (Number.isNaN(Date.parse(session.expiresAt))) {
    return `сессия роли «${roleId}»: expiresAt не дата ISO («${session.expiresAt}»)`;
  }
  const storage = Object.keys(session.storage ?? {}).length;
  const cookies = session.cookies?.length ?? 0;
  return storage + cookies === 0 ? `сессия роли «${roleId}» пустая: нужны storage или cookies` : null;
}
