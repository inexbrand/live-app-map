/**
 * Авто-вход dogfood: какие сессии запрашиваются у API korbor и что попадает в store.
 * Сеть — подмена fetch по адресу (API korbor в unit не поднят).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { jsonResponse, stubFetch } from '../test/fixtures';
import { fetchDogfoodActors, mintDogfoodSession, type DogfoodActor } from './dogfood-api';
import { ensureDogfoodSessions, type EnsureDogfoodInput } from './ensure-dogfood-sessions';

const ADMIN: DogfoodActor = { id: 'a1', kind: 'admin', label: 'ops@korbor', role: 'admin' };
const NO_TG: DogfoodActor = { id: 'u0', kind: 'user', label: 'Без телеграма', role: 'recruiter', telegramId: '  ' };
const RECRUITER: DogfoodActor = { id: 'u1', kind: 'user', label: 'Анна', role: 'recruiter', telegramId: '42' };

type Seen = { admin: string; init: string; role: string; toasts: string[]; errors: string[]; actors: number };

function input(seen: Seen, admin = '', init = ''): EnsureDogfoodInput {
  return {
    dogfoodAdminAccessToken: admin,
    dogfoodMiniappInitData: init,
    setDogfoodAdminAccessToken: (t) => { seen.admin = t; },
    setDogfoodMiniappInitData: (r) => { seen.init = r; },
    setGlobalRole: (r) => { seen.role = r; },
    onActors: (a) => { seen.actors = a.length; },
    onError: (m) => { seen.errors.push(m); },
    onToast: (m) => { seen.toasts.push(m); },
  };
}

function fresh(): Seen {
  return { admin: '', init: '', role: '', toasts: [], errors: [], actors: -1 };
}

type Mint = Record<string, Response>;

/** API korbor: список пользователей и вход по id. */
function korbor(actors: readonly DogfoodActor[] | Response, mint: Mint = {}) {
  return stubFetch((url, init) => {
    if (url.endsWith('/api/v1/dev/dogfood/actors')) {
      return actors instanceof Response ? actors : jsonResponse({ data: { actors } });
    }
    if (url.endsWith('/api/v1/dev/dogfood/session')) {
      const body: unknown = JSON.parse(String(init?.body));
      const id = typeof body === 'object' && body !== null && 'actorId' in body ? String(body.actorId) : '';
      return mint[id];
    }
    return undefined;
  });
}

let net: ReturnType<typeof stubFetch> | null = null;
afterEach(() => net?.restore());

describe('ensureDogfoodSessions', () => {
  test('production-сборка: ничего не запрашивает', async () => {
    net = korbor([ADMIN]);
    const seen = fresh();
    expect(await ensureDogfoodSessions(input(seen), { PROD: true })).toEqual({ ok: true, mintedAdmin: false, mintedMiniapp: false });
    expect(net.calls).toHaveLength(0);
  });

  test('обе сессии уже есть: API не трогается', async () => {
    net = korbor([ADMIN]);
    expect(await ensureDogfoodSessions(input(fresh(), 'tok', 'init'), {})).toEqual({ ok: true, mintedAdmin: false, mintedMiniapp: false });
    expect(net.calls).toHaveLength(0);
  });

  test('вход админом и пользователем с telegramId; роль из сессии', async () => {
    net = korbor([NO_TG, ADMIN, RECRUITER], {
      a1: jsonResponse({ data: { kind: 'admin', actorId: 'a1', label: 'ops', role: 'admin', accessToken: ' T1 ' } }),
      u1: jsonResponse({ data: { kind: 'user', actorId: 'u1', label: 'Анна', role: 'recruiter', initData: 'tg=1' } }),
    });
    const seen = fresh();
    expect(await ensureDogfoodSessions(input(seen), {})).toEqual({ ok: true, mintedAdmin: true, mintedMiniapp: true });
    expect(seen).toEqual({ admin: 'T1', init: 'tg=1', role: 'recruiter', toasts: [], errors: [], actors: 3 });
    expect(net.calls.map((c) => c.body)).toEqual([null, '{"kind":"admin","actorId":"a1"}', '{"kind":"user","actorId":"u1"}']);
  });

  test('API недоступен: ошибка в настройки и в toast', async () => {
    net = korbor(new Response('down', { status: 503 }));
    const seen = fresh();
    const res = await ensureDogfoodSessions(input(seen), {});
    const error = 'Авто-вход недоступен: actors HTTP 503 — API dev dogfood недоступен?. Поднимите API+Postgres и войдите в Настройках.';
    expect(res).toEqual({ ok: false, mintedAdmin: false, mintedMiniapp: false, error });
    expect(seen.errors).toEqual([error]);
    expect(seen.toasts).toEqual([error]);
  });

  test('нет пользователя с telegramId: мини-приложение без входа', async () => {
    net = korbor([NO_TG]);
    const seen = fresh();
    const msg = 'Miniapp: в БД нет user с telegramId — iframe останется без auth';
    expect(await ensureDogfoodSessions(input(seen, 'tok'), {})).toEqual({ ok: false, mintedAdmin: false, mintedMiniapp: false, error: msg });
    expect(seen.toasts).toEqual([msg]);
  });

  test('нужен только админ, админов нет: пользователь не запрашивается', async () => {
    net = korbor([RECRUITER]);
    expect(await ensureDogfoodSessions(input(fresh(), '', 'init'), {})).toEqual({ ok: true, mintedAdmin: false, mintedMiniapp: false });
    expect(net.calls).toHaveLength(1);
  });

  test('отказ входа: причина в toast, сессии не сохраняются', async () => {
    net = korbor([ADMIN, RECRUITER], {
      a1: jsonResponse({ error: { message: 'нет доступа' } }, 403),
      u1: jsonResponse({ error: { code: 'NO_TG' } }, 400),
    });
    const seen = fresh();
    expect(await ensureDogfoodSessions(input(seen), {})).toEqual({ ok: true, mintedAdmin: false, mintedMiniapp: false });
    expect(seen.toasts).toEqual(['Admin dogfood: session: нет доступа', 'Miniapp dogfood: session: NO_TG']);
    expect(seen.admin).toBe('');
  });

  test('сессии без токена и без initData не сохраняются', async () => {
    net = korbor([ADMIN, RECRUITER], {
      a1: jsonResponse({ data: { kind: 'admin', actorId: 'a1', label: 'ops', role: 'admin' } }),
      u1: jsonResponse({ data: { kind: 'user', actorId: 'u1', label: 'Анна', role: 'employer' } }),
    });
    const seen = fresh();
    expect(await ensureDogfoodSessions(input(seen), {})).toEqual({ ok: true, mintedAdmin: false, mintedMiniapp: false });
    expect(seen.role).toBe('employer');
    expect(seen.init).toBe('');
  });
});

describe('API dev-входа korbor', () => {
  test('ошибка без тела и без сообщения — HTTP-статус', async () => {
    net = korbor([], { a1: new Response('<html>', { status: 502 }), a2: jsonResponse({ error: {} }, 500) });
    expect(await mintDogfoodSession({ id: 'a1', kind: 'admin' })).toEqual({ ok: false, error: 'session: HTTP 502' });
    expect(await mintDogfoodSession({ id: 'a2', kind: 'admin' })).toEqual({ ok: false, error: 'session: HTTP 500' });
  });

  test('пустой data и обрыв сети', async () => {
    net = korbor([], { a1: jsonResponse({}) });
    expect(await mintDogfoodSession({ id: 'a1', kind: 'admin' })).toEqual({ ok: false, error: 'session: пустой data' });
    net.restore();
    net = stubFetch(() => { throw new Error('ECONNREFUSED'); });
    expect(await mintDogfoodSession({ id: 'a1', kind: 'admin' })).toEqual({ ok: false, error: 'session: ECONNREFUSED' });
    expect(await fetchDogfoodActors()).toEqual({ ok: false, error: 'actors: ECONNREFUSED (поднимите Korbor API :16000)' });
  });

  test('список пользователей: неверный ответ', async () => {
    net = stubFetch(() => jsonResponse({ data: {} }));
    expect(await fetchDogfoodActors('http://api.test')).toEqual({ ok: false, error: 'actors: неверный ответ API' });
    expect(net.calls[0]?.url).toBe('http://api.test/api/v1/dev/dogfood/actors');
  });
});
