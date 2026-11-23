/**
 * Dev-вход: обработчик приложения на настоящем Bun.serve и клиент визуализатора
 * поверх настоящего fetch.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import {
  createDevAuthHandler,
  DEV_AUTH_PATH,
  DEV_AUTH_SECRET_HEADER,
  fetchDevAuthRoles,
  isDevAuthExpired,
  isLoopbackAddress,
  issueDevAuthSession,
  type DevAuthOptions,
  type DevAuthRole,
} from './index';

const ISSUED: string[] = [];

const recruiter: DevAuthRole = {
  id: 'recruiter',
  label: 'Рекрутер',
  origin: 'https://vite.localhost:5175',
  issue: async () => {
    ISSUED.push('recruiter');
    return { storage: { lam_init_data: 'auth_date=1&hash=x' }, expiresAt: '2099-01-01T00:00:00.000Z', actor: 'tg:1001' };
  },
};
const admin: DevAuthRole = {
  id: 'admin',
  label: 'Админ',
  origin: 'http://localhost:16002',
  issue: async () => ({ cookies: ['admin_refresh=r; Path=/api/v1/auth/admin; HttpOnly'], storage: { 'korbor.admin.accessToken': 't' }, expiresAt: '2099-01-01T00:00:00.000Z' }),
};
const broken: DevAuthRole = {
  id: 'employer',
  label: 'Клиент',
  origin: 'https://vite.localhost:5175',
  issue: async () => {
    throw new Error('нет пользователя с ролью employer');
  },
};

function handlerOf(over: Partial<DevAuthOptions> = {}) {
  return createDevAuthHandler({ environment: 'development', roles: () => [recruiter, admin, broken], ...over });
}

const req = (path: string, init?: RequestInit) => new Request(`http://app.local${path}`, init);
const post = (role: unknown) => req(`${DEV_AUTH_PATH}/session`, { method: 'POST', body: JSON.stringify({ role }) });

describe('createDevAuthHandler', () => {
  it('без environment — ошибка с подсказкой', () => {
    expect(() => createDevAuthHandler({ environment: ' ', roles: () => [] })).toThrow(/NODE_ENV/);
  });

  it('production — маршрутов нет', async () => {
    const h = handlerOf({ environment: 'production' });
    expect(await h(req(`${DEV_AUTH_PATH}/roles`), '127.0.0.1')).toBeNull();
  });

  it('чужой путь и выключатель — null', async () => {
    expect(await handlerOf()(req('/api/v1/other'), '127.0.0.1')).toBeNull();
    expect(await handlerOf({ enabled: () => false })(req(`${DEV_AUTH_PATH}/roles`), '127.0.0.1')).toBeNull();
  });

  it('роли без функций выдачи', async () => {
    const res = await handlerOf()(req(`${DEV_AUTH_PATH}/roles`), '::1');
    expect(res?.status).toBe(200);
    const body: unknown = await res?.json();
    expect(body).toEqual({
      protocol: 1,
      roles: [
        { id: 'recruiter', label: 'Рекрутер', origin: 'https://vite.localhost:5175' },
        { id: 'admin', label: 'Админ', origin: 'http://localhost:16002' },
        { id: 'employer', label: 'Клиент', origin: 'https://vite.localhost:5175' },
      ],
    });
  });

  it('не с этой машины — 403, с секретом — пускает', async () => {
    const h = handlerOf({ secret: 's3' });
    expect((await h(req(`${DEV_AUTH_PATH}/roles`), '10.0.0.5'))?.status).toBe(403);
    const ok = await h(req(`${DEV_AUTH_PATH}/roles`, { headers: { [DEV_AUTH_SECRET_HEADER]: 's3' } }), '10.0.0.5');
    expect(ok?.status).toBe(200);
    const noSecret = await handlerOf()(req(`${DEV_AUTH_PATH}/roles`), '');
    expect(noSecret?.status).toBe(403);
  });

  it('сессия роли, пустая роль, неизвестная, сбой выдачи', async () => {
    const h = handlerOf();
    const ok = await h(post('recruiter'), '127.0.0.1');
    expect(ok?.status).toBe(200);
    const body: unknown = await ok?.json();
    expect(body).toMatchObject({ role: { id: 'recruiter' }, session: { storage: { lam_init_data: 'auth_date=1&hash=x' } } });
    expect((await h(post(''), '127.0.0.1'))?.status).toBe(400);
    expect((await h(post('ghost'), '127.0.0.1'))?.status).toBe(404);
    const bad = await h(post('employer'), '127.0.0.1');
    expect(bad?.status).toBe(502);
    expect(JSON.stringify(await bad?.json())).toContain('нет пользователя с ролью employer');
  });

  it('негодная роль и пустая сессия — 500 с причиной', async () => {
    const badId = handlerOf({ roles: () => [{ ...recruiter, id: 'Рекрутер' }] });
    const r1 = await badId(req(`${DEV_AUTH_PATH}/roles`), '127.0.0.1');
    expect(r1?.status).toBe(500);
    const empty = handlerOf({ roles: () => [{ ...recruiter, issue: async () => ({ expiresAt: '2099-01-01T00:00:00Z' }) }] });
    const r2 = await empty(post('recruiter'), '127.0.0.1');
    expect(r2?.status).toBe(500);
    expect(JSON.stringify(await r2?.json())).toContain('пустая');
  });
});

describe('клиент визуализатора через настоящий сервер', () => {
  const handler = handlerOf({ secret: 'k' });
  const server = Bun.serve({
    port: 0,
    fetch: async (request, srv) => (await handler(request, srv.requestIP(request)?.address ?? '')) ?? new Response('not found', { status: 404 }),
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const o = { fetch: (url: string, init: RequestInit) => fetch(url, init), secret: '', timeoutMs: 3000 };
  afterAll(() => server.stop(true));

  it('роли и сессия', async () => {
    const roles = await fetchDevAuthRoles(origin, o);
    expect(roles.ok && roles.roles.map((r) => r.id)).toEqual(['recruiter', 'admin', 'employer']);
    const before = ISSUED.length;
    const s = await issueDevAuthSession(origin, 'admin', o);
    expect(s.ok && s.session.cookies).toEqual(['admin_refresh=r; Path=/api/v1/auth/admin; HttpOnly']);
    expect(ISSUED.length).toBe(before);
    const fail = await issueDevAuthSession(origin, 'employer', o);
    expect(fail.ok ? '' : fail.error).toContain('нет пользователя');
  });

  it('у приложения нет dev-входа — absent, сеть упала — не absent', async () => {
    const other = Bun.serve({ port: 0, fetch: () => new Response('<html>', { status: 404 }) });
    const r = await fetchDevAuthRoles(`http://127.0.0.1:${other.port}`, o);
    void other.stop(true);
    expect(r).toMatchObject({ ok: false, absent: true });
    const down = await fetchDevAuthRoles('http://127.0.0.1:1', o);
    expect(down).toMatchObject({ ok: false, absent: false });
  });
});

describe('мелочи', () => {
  it('loopback и срок', () => {
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].every(isLoopbackAddress)).toBe(true);
    expect(isLoopbackAddress('192.168.1.2')).toBe(false);
    expect(isDevAuthExpired('2020-01-01T00:00:00Z', Date.now(), 0)).toBe(true);
    expect(isDevAuthExpired(new Date(Date.now() + 120_000).toISOString(), Date.now(), 60_000)).toBe(false);
    expect(isDevAuthExpired('не дата', Date.now(), 0)).toBe(true);
  });
});
