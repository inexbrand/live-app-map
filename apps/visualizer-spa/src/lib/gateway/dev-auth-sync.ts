/**
 * Автовход шлюза: спросить роли у приложений карты (протокол
 * `@live-app-map/dev-auth`) и завести профиль на каждую роль. Человеку не
 * нужно ничего вводить — профили появляются при загрузке карты и
 * обновляются сами, когда срок сессии подходит.
 */
import {
  DEV_AUTH_SECRET_ENV,
  fetchDevAuthRoles,
  isDevAuthExpired,
  issueDevAuthSession,
  type DevAuthClientOptions,
  type DevAuthRoleInfo,
  type DevAuthSession,
} from '@live-app-map/dev-auth';
import { parseSetCookie } from './cookie-jar';
import type { ProfileInput, SessionStore } from './session-store';

/** Запас до срока сессии: выдаём заново заранее, мс. */
export const DEV_AUTH_MARGIN_MS = 60_000;

/** Откуда профиль получил вход и когда его выдать заново. */
export type DevAuthLink = {
  /** Origin, через который нашлась роль (его `/api` ведёт к бэкенду приложения). */
  readonly source: string;
  readonly role: string;
  readonly expiresAt: string;
};

/** Что ответило приложение по одному origin карты. */
export type DevAuthSourceReport = {
  readonly origin: string;
  /** ok — роли есть; absent — у приложения нет dev-входа; error — сбой. */
  readonly state: 'ok' | 'absent' | 'error';
  readonly roles: readonly string[];
  readonly error?: string;
};

/** Что стало с профилем роли. */
export type DevAuthProfileReport = {
  readonly id: string;
  readonly label: string;
  readonly origin: string;
  /** issued — вход выдан сейчас; fresh — прежний ещё годен; error — не выдан. */
  readonly state: 'issued' | 'fresh' | 'error';
  readonly error?: string;
};

/** Итог автовхода. */
export type DevAuthSyncReport = { readonly sources: readonly DevAuthSourceReport[]; readonly profiles: readonly DevAuthProfileReport[] };

/** Предел ожидания приложения: недоступное не должно держать загрузку карты. */
const TIMEOUT_MS = 5000;

/**
 * Как шлюз ходит в приложения: самоподписанный HTTPS dev-серверов принимается,
 * секрет — из `LAM_DEV_AUTH_SECRET` (пусто — без секрета, хватает loopback).
 *
 * @param env - окружение процесса
 */
export function gatewayDevAuthClient(env: Readonly<Record<string, string | undefined>> = process.env): DevAuthClientOptions {
  return {
    fetch: (url, init) => fetch(url, { ...init, tls: { rejectUnauthorized: false } }),
    secret: env[DEV_AUTH_SECRET_ENV]?.trim() ?? '',
    timeoutMs: TIMEOUT_MS,
  };
}

/**
 * Данные профиля из сессии роли.
 *
 * @param role - роль приложения
 * @param session - выданная сессия
 * @param source - origin, через который она выдана
 * @param now - текущее время, мс (для Max-Age кук)
 */
export function profileInputOf(role: DevAuthRoleInfo, session: DevAuthSession, source: string, now: number): ProfileInput {
  const cookies = (session.cookies ?? []).map((c) => parseSetCookie(c, now)).filter((c) => c !== null);
  return {
    id: role.id,
    label: role.label,
    role: role.id,
    origin: role.origin,
    ...(cookies.length === 0 ? {} : { cookies }),
    ...(session.storage === undefined ? {} : { storage: session.storage }),
    devAuth: { source, role: role.id, expiresAt: session.expiresAt },
  };
}

/**
 * Выдаёт вход по связи профиля заново.
 *
 * @param store - профили
 * @param profileId - профиль
 * @param link - откуда и какая роль
 * @param client - как ходить в приложение
 * @returns ошибка или null
 */
export async function reissueDevAuth(store: SessionStore, profileId: string, link: DevAuthLink, client: DevAuthClientOptions): Promise<string | null> {
  const r = await issueDevAuthSession(link.source, link.role, client);
  if (!r.ok) {
    return r.error;
  }
  store.upsert({ ...profileInputOf(r.role, r.session, link.source, Date.now()), id: profileId });
  return null;
}

/** Роль и где она нашлась. */
type FoundRole = { readonly role: DevAuthRoleInfo; readonly source: string };

/** Роли всех origin карты; роль с origin вне карты не нужна. */
async function discover(origins: readonly string[], client: DevAuthClientOptions): Promise<{ sources: DevAuthSourceReport[]; found: FoundRole[] }> {
  const wanted = new Set(origins);
  const answers = await Promise.all(origins.map(async (origin) => ({ origin, r: await fetchDevAuthRoles(origin, client) })));
  const found = new Map<string, FoundRole>();
  const sources = answers.map(({ origin, r }): DevAuthSourceReport => {
    if (!r.ok) {
      return { origin, state: r.absent ? 'absent' : 'error', roles: [], error: r.error };
    }
    for (const role of r.roles) {
      const key = `${role.id}|${role.origin}`;
      if (wanted.has(role.origin) && !found.has(key)) {
        found.set(key, { role, source: origin });
      }
    }
    return { origin, state: 'ok', roles: r.roles.map((x) => x.id) };
  });
  return { sources, found: [...found.values()] };
}

/** Вход одной роли: прежний годен — не трогаем (лишняя сессия в базе приложения). */
async function syncRole(store: SessionStore, f: FoundRole, client: DevAuthClientOptions, now: number): Promise<DevAuthProfileReport> {
  const base = { id: f.role.id, label: f.role.label, origin: f.role.origin };
  const prev = store.get(f.role.id)?.devAuth?.[f.role.origin];
  if (prev !== undefined && !isDevAuthExpired(prev.expiresAt, now, DEV_AUTH_MARGIN_MS)) {
    return { ...base, state: 'fresh' };
  }
  const r = await issueDevAuthSession(f.source, f.role.id, client);
  if (!r.ok) {
    return { ...base, state: 'error', error: r.error };
  }
  store.upsert(profileInputOf(r.role, r.session, f.source, Date.now()));
  return { ...base, state: 'issued' };
}

/**
 * Автовход: роли приложений карты → профили шлюза.
 *
 * @param store - профили
 * @param origins - origin экранов карты
 * @param client - как ходить в приложения
 * @param now - текущее время, мс
 */
export async function syncDevAuth(store: SessionStore, origins: readonly string[], client: DevAuthClientOptions, now: number = Date.now()): Promise<DevAuthSyncReport> {
  const { sources, found } = await discover(origins, client);
  const profiles = await Promise.all(found.map((f) => syncRole(store, f, client, now)));
  return { sources, profiles };
}
