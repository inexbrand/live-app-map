/**
 * Форма входа в профиль: поля → запрос к `/__lam_sessions`. Пустое
 * обязательное поле — ошибка с подсказкой под ним, без подстановок.
 */
import { isValidProfileId } from './gateway-host';

/** Способ входа. */
export type SessionMethod = 'korbor-dogfood' | 'paste';

/** Поля формы. */
export type SessionFormFields = {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly origin: string;
  readonly method: SessionMethod;
  /** korbor-dogfood: «admin:<uuid>» или «user:<uuid>». */
  readonly actor: string;
  readonly apiBase: string;
  /** paste: «a=1; b=2». */
  readonly cookies: string;
  readonly storageKey: string;
  readonly storageValue: string;
};

/** Запрос или ошибка поля. */
export type SessionRequest =
  | { readonly ok: true; readonly method: 'POST' | 'PUT'; readonly path: string; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly field: keyof SessionFormFields; readonly error: string };

function fail(field: keyof SessionFormFields, error: string): SessionRequest {
  return { ok: false, field, error };
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Проверяет поля и строит запрос.
 *
 * @param f - поля формы
 */
export function buildSessionRequest(f: SessionFormFields): SessionRequest {
  const id = f.id.trim();
  if (!isValidProfileId(id)) {
    return fail('id', 'Впишите id: строчные латинские буквы, цифры, дефис — например recruiter');
  }
  if (f.label.trim() === '') {
    return fail('label', 'Впишите подпись профиля, например «Рекрутер»');
  }
  if (!isHttpUrl(f.origin.trim())) {
    return fail('origin', 'Выберите приложение — адрес вида http://localhost:16002');
  }
  const base = { label: f.label.trim(), role: f.role.trim(), origin: new URL(f.origin.trim()).origin };
  const path = `/__lam_sessions/${id}`;
  if (f.method === 'korbor-dogfood') {
    const [kind, actorId] = f.actor.split(':');
    if ((kind !== 'admin' && kind !== 'user') || actorId === undefined || actorId === '') {
      return fail('actor', 'Выберите пользователя из базы korbor');
    }
    if (!isHttpUrl(f.apiBase.trim())) {
      return fail('apiBase', 'Впишите адрес API korbor, например http://127.0.0.1:16000');
    }
    return { ok: true, method: 'POST', path: `${path}/korbor-dogfood`, body: { ...base, kind, actorId, apiBase: f.apiBase.trim() } };
  }
  const cookies = f.cookies.trim();
  const key = f.storageKey.trim();
  const value = f.storageValue.trim();
  if (key !== '' && value === '') {
    return fail('storageValue', `Впишите значение для «${key}» (токен, initData)`);
  }
  if (value !== '' && key === '') {
    return fail('storageKey', 'Впишите ключ sessionStorage, куда приложение кладёт токен');
  }
  if (cookies === '' && key === '') {
    return fail('cookies', 'Вставьте куки («sid=…; csrf=…») или токен с ключом sessionStorage');
  }
  return {
    ok: true,
    method: 'PUT',
    path,
    body: { ...base, ...(cookies === '' ? {} : { cookies }), ...(key === '' ? {} : { storage: { [key]: value } }) },
  };
}
