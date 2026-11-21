/**
 * Dev-вход Korbor (`/api/v1/dev/dogfood/session`): выдаёт initData
 * мини-приложения или access-токен админки. Шлюз обновляет их сам, когда
 * они устарели, — вход в профиль делается один раз.
 */

/** Ключи sessionStorage, откуда приложения Korbor берут dev-вход. */
export const KORBOR_DOGFOOD_STORAGE: Readonly<Record<KorborRenewal['kind'], string>> = { user: 'lam_init_data', admin: 'korbor.admin.accessToken' };

/** Как обновить вход профиля. */
export type KorborRenewal = {
  readonly kind: 'user' | 'admin';
  readonly actorId: string;
  readonly apiBase: string;
};

/** Запас до истечения, мс: обновляем заранее. */
const EXPIRY_MARGIN_MS = 60_000;
/** Возраст initData, после которого обновляем (API проверяет auth_date). */
const INIT_DATA_MAX_AGE_MS = 60 * 60_000;

/**
 * Устарело ли значение входа.
 *
 * @param kind - user: initData с auth_date (секунды); admin: JWT с exp
 * @param value - значение из sessionStorage профиля
 * @param now - текущее время, мс
 */
export function isDogfoodValueStale(kind: 'user' | 'admin', value: string | undefined, now: number): boolean {
  if (value === undefined || value === '') {
    return true;
  }
  if (kind === 'user') {
    const authDate = Number(new URLSearchParams(value).get('auth_date'));
    return !Number.isFinite(authDate) || authDate === 0 || now - authDate * 1000 > INIT_DATA_MAX_AGE_MS;
  }
  const payload = value.split('.')[1];
  if (payload === undefined) {
    return true;
  }
  try {
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = typeof json === 'object' && json !== null && 'exp' in json && typeof json.exp === 'number' ? json.exp : 0;
    return exp * 1000 - EXPIRY_MARGIN_MS < now;
  } catch {
    return true;
  }
}

/** Результат входа. */
export type MintResult = { ok: true; value: string; label: string; role: string } | { ok: false; error: string };

/**
 * Получает вход у dev-API Korbor.
 *
 * @param r - тип, актёр, адрес API
 */
export async function mintKorbor(r: KorborRenewal): Promise<MintResult> {
  const res = await fetch(`${r.apiBase.replace(/\/$/, '')}/api/v1/dev/dogfood/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: r.kind, actorId: r.actorId }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await res.json().catch(() => null);
  const data = typeof body === 'object' && body !== null && 'data' in body && typeof body.data === 'object' && body.data !== null ? body.data : null;
  const value = data === null ? undefined : r.kind === 'user' ? ('initData' in data ? data.initData : undefined) : 'accessToken' in data ? data.accessToken : undefined;
  if (!res.ok || typeof value !== 'string' || value === '') {
    return { ok: false, error: `вход не выдан (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 200)}` };
  }
  const label = data !== null && 'label' in data && typeof data.label === 'string' ? data.label : r.actorId;
  const role = data !== null && 'role' in data && typeof data.role === 'string' ? data.role : r.kind;
  return { ok: true, value, label, role };
}
/** Bearer для API Korbor или ошибка. */
export type BearerResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * Bearer API Korbor из dev-входа профиля: у админки это сам access-токен,
 * у мини-аппа initData меняется на токен (`POST /api/v1/auth/telegram/miniapp`).
 *
 * @param r - тип входа и адрес API
 * @param value - значение входа из профиля (initData или токен)
 */
export async function korborBearer(r: KorborRenewal, value: string): Promise<BearerResult> {
  if (value === '') {
    return { ok: false, error: 'у профиля нет dev-входа: войдите через «Профили»' };
  }
  if (r.kind === 'admin') {
    return { ok: true, token: value };
  }
  const res = await fetch(`${r.apiBase.replace(/\/$/, '')}/api/v1/auth/telegram/miniapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: value }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = res.ok ? accessTokenOf(await res.json().catch(() => null)) : '';
  return token !== '' ? { ok: true, token } : { ok: false, error: `вход мини-аппа не выдан (HTTP ${res.status})` };
}

/** data.accessToken ответа входа или ''. */
function accessTokenOf(body: unknown): string {
  const data = typeof body === 'object' && body !== null && 'data' in body ? body.data : null;
  return typeof data === 'object' && data !== null && 'accessToken' in data && typeof data.accessToken === 'string' ? data.accessToken : '';
}
