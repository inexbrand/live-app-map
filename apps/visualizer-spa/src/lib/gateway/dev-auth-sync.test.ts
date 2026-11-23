/**
 * Автовход шлюза на настоящих серверах: приложение с обработчиком
 * `@live-app-map/dev-auth` на Bun.serve, приложение без него, настоящее
 * хранилище профилей во временной папке.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDevAuthHandler, type DevAuthRole } from '@live-app-map/dev-auth';
import { cookieHeaderFor } from './cookie-jar';
import { profileInputOf, syncDevAuth } from './dev-auth-sync';
import { SessionStore } from './session-store';

let issued = 0;
/** Срок следующей выдачи админа: тест двигает его, чтобы проверить обновление. */
let adminExpires = '2099-01-01T00:00:00.000Z';

const app = Bun.serve({ port: 0, fetch: async (req, srv) => (await handler(req, srv.requestIP(req)?.address ?? '')) ?? new Response('нет', { status: 404 }) });
const appOrigin = `http://127.0.0.1:${app.port}`;
const site = Bun.serve({ port: 0, fetch: () => new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }) });
const siteOrigin = `http://127.0.0.1:${site.port}`;

const roles: DevAuthRole[] = [
  {
    id: 'admin',
    label: 'Админ',
    origin: appOrigin,
    issue: async () => {
      issued++;
      return { cookies: [`admin_refresh=r${issued}; Path=/api/v1/auth/admin; HttpOnly; Max-Age=600`], storage: { token: `t${issued}` }, expiresAt: adminExpires };
    },
  },
  { id: 'recruiter', label: 'Рекрутер', origin: 'https://not-on-map.localhost:5175', issue: async () => ({ storage: { x: '1' }, expiresAt: adminExpires }) },
  {
    id: 'employer',
    label: 'Клиент',
    origin: appOrigin,
    issue: async () => {
      throw new Error('нет пользователя с ролью employer');
    },
  },
];
const handler = createDevAuthHandler({ environment: 'development', roles: () => roles });

const dir = mkdtempSync(path.join(tmpdir(), 'lam-dev-auth-'));
const client = { fetch: (url: string, init: RequestInit) => fetch(url, init), secret: '', timeoutMs: 3000 };

afterAll(() => {
  void app.stop(true);
  void site.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('syncDevAuth', () => {
  it('роли карты — профили; роль вне карты пропущена; сбой роли и приложение без входа — в отчёте', async () => {
    const store = new SessionStore(dir);
    const report = await syncDevAuth(store, [appOrigin, siteOrigin], client);
    expect(report.sources.map((s) => [s.origin, s.state])).toEqual([
      [appOrigin, 'ok'],
      [siteOrigin, 'absent'],
    ]);
    expect(report.profiles.map((p) => [p.id, p.state])).toEqual([
      ['admin', 'issued'],
      ['employer', 'error'],
    ]);
    expect(report.profiles[1]?.error).toContain('нет пользователя с ролью employer');
    const admin = store.get('admin');
    expect(admin?.storage[appOrigin]).toEqual({ token: 't1' });
    expect(cookieHeaderFor('', admin?.cookies[appOrigin] ?? [], '/api/v1/auth/admin/refresh', Date.now())).toBe('admin_refresh=r1');
    expect(cookieHeaderFor('', admin?.cookies[appOrigin] ?? [], '/api/v1/other', Date.now())).toBe('');
    expect(store.get('recruiter')).toBeUndefined();
  });

  it('прежний вход годен — не выдаётся заново; профиль пережил перезапуск', async () => {
    const store = new SessionStore(dir);
    const report = await syncDevAuth(store, [appOrigin], client);
    expect(report.profiles.find((p) => p.id === 'admin')?.state).toBe('fresh');
    expect(issued).toBe(1);
  });

  it('срок вышел — шлюз выдаёт вход заново перед загрузкой страницы', async () => {
    const store = new SessionStore(dir);
    store.upsert(profileInputOf(roles[0] ?? { id: 'admin', label: 'Админ', origin: appOrigin }, { storage: { token: 'old' }, expiresAt: '2000-01-01T00:00:00Z' }, appOrigin, Date.now()));
    adminExpires = '2099-02-01T00:00:00.000Z';
    expect(await store.ensureFresh('admin', appOrigin)).toBeNull();
    expect(store.get('admin')?.storage[appOrigin]?.['token']).toBe('t2');
    expect(store.get('admin')?.devAuth?.[appOrigin]?.expiresAt).toBe('2099-02-01T00:00:00.000Z');
  });
});
