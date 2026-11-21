/**
 * REST профилей сессий на dev-сервере визуализатора: `/__lam_sessions`.
 * Ответы не содержат значений кук и токенов — только имена.
 */
import { isLocalOrigin, readBody, requestPath, sendJson, type DevMiddleware } from '../dev-http';
import { parseSetCookie } from './cookie-jar';
import { isValidProfileId } from './gateway-host';
import { KORBOR_DOGFOOD_STORAGE, mintKorbor, type KorborRenewal } from './korbor-dogfood';
import { summarize, type SessionStore } from './session-store';

/** Префикс маршрутов. */
export const SESSIONS_PATH = '/__lam_sessions';


const MAX_BODY = 64 * 1024;

/** Тело JSON-объектом или null. */
function asObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
  } catch {
    return null;
  }
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === 'string' ? v.trim() : '';
}

/** Origin приложения из тела: обязателен для данных сессии. */
function originOf(o: Record<string, unknown>): string | null {
  try {
    const u = new URL(str(o, 'origin'));
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Middleware профилей.
 *
 * @param store - хранилище профилей
 * @param gatewayPort - порт шлюза (отдаётся клиенту)
 */
export function createSessionsMiddleware(store: SessionStore, gatewayPort: number): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== SESSIONS_PATH && !p.startsWith(`${SESSIONS_PATH}/`)) {
      next();
      return;
    }
    // Только сама страница визуализатора: страницы приложений в iframe шлюза тоже *.localhost.
    const origin = req.headers.origin;
    if (!isLocalOrigin(req) || (origin !== undefined && origin !== '' && origin !== `http://${req.headers.host ?? ''}`)) {
      sendJson(res, 403, { ok: false, error: 'профили доступны только странице визуализатора' });
      return;
    }
    const rest = p.slice(SESSIONS_PATH.length).split('/').filter((s) => s !== '');
    void handle(req.method ?? 'GET', rest[0] ?? '', rest[1] ?? '').catch((err: unknown) => {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });

    async function handle(method: string, profileId: string, act: string): Promise<void> {
      if (method === 'GET' && profileId === '') {
        sendJson(res, 200, { ok: true, gatewayPort, profiles: store.list().map(summarize) });
        return;
      }
      if (!isValidProfileId(profileId)) {
        sendJson(res, 400, { ok: false, error: 'id профиля: строчные латинские буквы, цифры, дефис (например recruiter)', field: 'id' });
        return;
      }
      if (method === 'DELETE' && act === '') {
        sendJson(res, store.remove(profileId) ? 200 : 404, { ok: true });
        return;
      }
      const body = await readBody(req, MAX_BODY);
      if (!body.ok) {
        sendJson(res, body.status, { ok: false, error: body.error });
        return;
      }
      const o = asObject(body.text);
      if (o === null) {
        sendJson(res, 400, { ok: false, error: 'тело — JSON-объект' });
        return;
      }
      const origin = originOf(o);
      if (origin === null) {
        sendJson(res, 400, { ok: false, error: 'origin обязателен: адрес приложения, например http://localhost:16002', field: 'origin' });
        return;
      }
      const label = str(o, 'label');
      if (label === '') {
        sendJson(res, 400, { ok: false, error: 'label обязателен: подпись профиля, например «Админ»', field: 'label' });
        return;
      }
      if (method === 'PUT' && act === '') {
        const now = Date.now();
        const cookieText = str(o, 'cookies');
        const cookies = cookieText === '' ? undefined : cookieText.split(';').map((s) => parseSetCookie(s.trim(), now)).filter((c) => c !== null);
        const rawStorage = o['storage'];
        const storage =
          typeof rawStorage === 'object' && rawStorage !== null && !Array.isArray(rawStorage)
            ? Object.fromEntries(Object.entries(rawStorage).filter((e): e is [string, string] => typeof e[1] === 'string'))
            : undefined;
        if (cookies === undefined && storage === undefined) {
          sendJson(res, 400, { ok: false, error: 'нужны cookies («a=1; b=2») или storage ({ключ: значение})', field: 'cookies' });
          return;
        }
        const saved = store.upsert({ id: profileId, label, role: str(o, 'role'), origin, ...(cookies === undefined ? {} : { cookies }), ...(storage === undefined ? {} : { storage }) });
        sendJson(res, 200, { ok: true, profile: summarize(saved) });
        return;
      }
      if (method === 'POST' && act === 'korbor-dogfood') {
        const kind = str(o, 'kind') === 'admin' ? 'admin' : 'user';
        const actorId = str(o, 'actorId');
        const apiBase = str(o, 'apiBase');
        if (actorId === '' || apiBase === '') {
          sendJson(res, 400, { ok: false, error: 'actorId и apiBase обязательны (apiBase — адрес API korbor, например http://127.0.0.1:16000)', field: actorId === '' ? 'actorId' : 'apiBase' });
          return;
        }
        const renewal: KorborRenewal = { kind, actorId, apiBase };
        const minted = await mintKorbor(renewal);
        if (!minted.ok) {
          sendJson(res, 502, { ok: false, error: minted.error });
          return;
        }
        const saved = store.upsert({
          id: profileId,
          label,
          role: str(o, 'role') === '' ? minted.role : str(o, 'role'),
          origin,
          storage: { [KORBOR_DOGFOOD_STORAGE[kind]]: minted.value },
          renewal,
        });
        sendJson(res, 200, { ok: true, actor: { label: minted.label, role: minted.role }, profile: summarize(saved) });
        return;
      }
      sendJson(res, 405, { ok: false, error: `${method} ${p} не поддерживается` });
    }
  };
}
