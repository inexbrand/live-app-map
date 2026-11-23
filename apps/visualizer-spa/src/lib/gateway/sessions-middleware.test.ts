/**
 * REST профилей на настоящем HTTP-сервере: список, сохранение кук и storage,
 * dev-вход Korbor через поддельное API, первые id списков, отказы с подсказкой.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from '../dev-http.test-helpers';
import { SessionStore } from './session-store';
import { createSessionsMiddleware } from './sessions-middleware';
import { createDevAuthHandler } from '@live-app-map/dev-auth';

const APP = 'http://localhost:16002';
const initData = (): string => `auth_date=${Math.floor(Date.now() / 1000)}&hash=h`;

/** API, похожее на korbor: dev-вход, обмен initData на токен, список вакансий. */
const korbor = Bun.serve({
  port: 0,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === '/api/v1/dev/dogfood/session') {
      const body: unknown = await req.json();
      const kind = typeof body === 'object' && body !== null && 'kind' in body ? body.kind : '';
      const actor = typeof body === 'object' && body !== null && 'actorId' in body ? body.actorId : '';
      if (actor === 'нет') {
        return Response.json({ error: 'нет актёра' }, { status: 404 });
      }
      return Response.json({ data: kind === 'admin' ? { accessToken: 'adm-token', label: 'Админ Иван', role: 'admin' } : { initData: initData(), label: 'Рекрутер Анна' } });
    }
    if (p === '/api/v1/auth/telegram/miniapp') {
      return Response.json({ data: { accessToken: `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.s` } });
    }
    if (p === '/api/v1/vacancies') {
      return req.headers.get('authorization')?.startsWith('Bearer ') === true ? Response.json({ data: [{ id: 'vac-1' }] }) : new Response('', { status: 401 });
    }
    return new Response('', { status: 404 });
  },
});
const API = `http://127.0.0.1:${korbor.port}`;
afterAll(() => korbor.stop(true));

let server: TestServer;
let store: SessionStore;

beforeEach(async () => {
  store = new SessionStore(mkdtempSync(path.join(tmpdir(), 'lam-sessions-')));
  server = await serveMiddleware(createSessionsMiddleware(store, 4320));
});
afterEach(() => server.close());

async function call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${server.url}/__lam_sessions${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await r.text();
  const json: unknown = text === '' ? {} : JSON.parse(text);
  return { status: r.status, json: typeof json === 'object' && json !== null ? Object.fromEntries(Object.entries(json)) : {} };
}

describe('sessions middleware', () => {
  test('список пуст, порт шлюза отдаётся; чужие пути — дальше', async () => {
    expect(await call('GET', '')).toEqual({ status: 200, json: { ok: true, gatewayPort: 4320, profiles: [] } });
    expect((await fetch(`${server.url}/__lam_other`)).status).toBe(404);
  });

  test('куки и storage сохраняются; в ответе только имена', async () => {
    const put = await call('PUT', '/recruiter', { label: ' Рекрутер ', role: 'hr', origin: `${APP}/feed`, cookies: 'sid=1; theme=dark', storage: { token: 'abc', skip: 1 } });
    expect(put.status).toBe(200);
    expect(put.json['profile']).toMatchObject({ id: 'recruiter', label: 'Рекрутер', role: 'hr', origins: [{ origin: APP, cookies: ['sid', 'theme'], storageKeys: ['token'] }] });
    expect(JSON.stringify(put.json)).not.toContain('abc');
    const list = await call('GET', '');
    expect(list.json['profiles']).toHaveLength(1);
    expect((await call('DELETE', '/recruiter')).status).toBe(200);
    expect((await call('DELETE', '/recruiter')).status).toBe(404);
  });

  test('отказы: id, тело, origin, label, пустые данные, метод', async () => {
    expect((await call('PUT', '/Bad_Id', {})).json).toMatchObject({ field: 'id' });
    expect((await call('PUT', '/a', '[1]')).status).toBe(400);
    expect((await call('PUT', '/a', '{не json')).status).toBe(400);
    expect((await call('PUT', '/a', { label: 'A' })).json).toMatchObject({ field: 'origin' });
    expect((await call('PUT', '/a', { origin: APP })).json).toMatchObject({ field: 'label' });
    expect((await call('PUT', '/a', { origin: APP, label: 'A' })).json).toMatchObject({ field: 'cookies' });
    expect((await call('PATCH', '/a', { origin: APP, label: 'A' })).status).toBe(405);
  });

  test('только страница визуализатора: чужой origin — 403', async () => {
    expect((await call('GET', '', undefined, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await call('GET', '', undefined, { origin: 'http://app.localhost:5173' })).status).toBe(403);
  });

  test('dev-вход Korbor: мини-апп и админка; подпись и роль из ответа API', async () => {
    const user = await call('POST', '/anna/korbor-dogfood', { label: 'Анна', origin: APP, kind: 'user', actorId: 'r-1', apiBase: API });
    expect(user.status).toBe(200);
    expect(user.json['actor']).toEqual({ label: 'Рекрутер Анна', role: 'user' });
    expect(store.get('anna')?.storage[APP]?.['lam_init_data']).toContain('auth_date=');
    const admin = await call('POST', '/ivan/korbor-dogfood', { label: 'Иван', origin: APP, kind: 'admin', actorId: 'a-1', apiBase: API, role: 'boss' });
    expect(admin.json['profile']).toMatchObject({ role: 'boss' });
    expect(store.get('ivan')?.storage[APP]?.['korbor.admin.accessToken']).toBe('adm-token');
    expect((await call('POST', '/x/korbor-dogfood', { label: 'X', origin: APP, apiBase: API })).json).toMatchObject({ field: 'actorId' });
    expect((await call('POST', '/x/korbor-dogfood', { label: 'X', origin: APP, actorId: 'a' })).json).toMatchObject({ field: 'apiBase' });
    expect((await call('POST', '/x/korbor-dogfood', { label: 'X', origin: APP, actorId: 'нет', apiBase: API })).status).toBe(502);
  });

  test('первые id списков под профилем; без dev-входа — 404 с подсказкой', async () => {
    await call('POST', '/anna/korbor-dogfood', { label: 'Анна', origin: APP, kind: 'user', actorId: 'r-1', apiBase: API });
    const ids = await call('POST', '/anna/sample-ids', { origin: APP, lists: ['/api/v1/vacancies', 7] });
    expect(ids).toEqual({ status: 200, json: { ok: true, values: { '/api/v1/vacancies': 'vac-1' } } });
    const none = await call('POST', '/nobody/sample-ids', { origin: APP, lists: [] });
    expect(none.status).toBe(404);
    expect(String(none.json['error'])).toContain('войдите через «Профили»');
  });
});

describe('автовход /__lam_sessions/auto', () => {
  test('без origins — 400 с полем; роли приложения — профили в ответе', async () => {
    expect(await call('POST', '/auto', {})).toMatchObject({ status: 400, json: { field: 'origins' } });
    expect(await call('POST', '/auto', { origins: ['не адрес'] })).toMatchObject({ status: 400 });
    const app = Bun.serve({
      port: 0,
      fetch: async (req, srv) => (await devAuth(req, srv.requestIP(req)?.address ?? '')) ?? new Response('', { status: 404 }),
    });
    const origin = `http://127.0.0.1:${app.port}`;
    const devAuth = createDevAuthHandler({
      environment: 'development',
      roles: () => [{ id: 'admin', label: 'Админ', origin, issue: async () => ({ storage: { token: 'adm' }, expiresAt: '2099-01-01T00:00:00Z' }) }],
    });
    const r = await call('POST', '/auto', { origins: [`${origin}/some/page`] });
    void app.stop(true);
    expect(r.status).toBe(200);
    expect(r.json['roles']).toEqual([{ id: 'admin', label: 'Админ', origin, state: 'issued' }]);
    expect(r.json['profiles']).toEqual([
      { id: 'admin', label: 'Админ', role: 'admin', origins: [{ origin, cookies: [], storageKeys: ['token'], autoUntil: '2099-01-01T00:00:00Z' }], updatedAt: store.get('admin')?.updatedAt },
    ]);
  });
});
