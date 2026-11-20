/**
 * Вызовы API во фронтендах фикстуры и их сопоставление с роутами:
 * fetch, axios, ky, Eden treaty, Hono RPC, обёртки проекта, база из env, экраны.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ApiCall, CodeModel } from '@live-app-map/schema';
import { scanSource } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-monorepo');
const USERS_SCREEN = 'apps/web/src/app/users/page.tsx';
const ORDERS_SCREEN = 'apps/web/src/app/orders/page.tsx';
const PROFILE_SCREEN = 'apps/miniapp/src/screens/Profile.tsx';

let code: CodeModel;

beforeAll(() => {
  code = scanSource({ root: FIXTURE, entries: [USERS_SCREEN, ORDERS_SCREEN, PROFILE_SCREEN] }).code;
});

/** Вызов строкой «МЕТОД путь клиент → роут» для сравнения целиком. */
function show(c: ApiCall): string {
  const route = code.routes.find((r) => r.id === c.routeId);
  const target = route === undefined ? 'нет роута' : `${route.method} ${route.path}`;
  return `${c.method} ${c.path} ${c.client}${c.via === undefined ? '' : ` via ${c.via}`} → ${target}`;
}

/** Вызовы файла строками. */
function callsIn(file: string): string[] {
  return (code.apiCalls ?? []).filter((c) => c.location.file === file).map(show).sort();
}

/** Вызовы экрана строками, с функцией-посредником. */
function screenCalls(file: string): string[] {
  const screen = code.screens?.find((s) => s.file === file);
  if (screen === undefined) {
    throw new Error(`нет экрана ${file}`);
  }
  const byId = new Map((code.apiCalls ?? []).map((c) => [c.id, c]));
  return screen.calls
    .map((s) => {
      const call = byId.get(s.callId);
      return call === undefined ? 'нет вызова' : `${call.method} ${call.path}${s.via === undefined ? '' : ` ← ${s.via}`}`;
    })
    .sort();
}

describe('scanSource: вызовы API', () => {
  test('обёртки apiFetch и api.delete: путь от вызывающего, метод из опций и имени, база /api', () => {
    expect(callsIn('apps/web/src/lib/users.ts')).toEqual([
      'DELETE /api/admin/users/:id wrapper via api.delete → DELETE /api/admin/users/:id',
      'GET /api/users wrapper via apiFetch → GET /api/users',
      'GET /api/users/:id wrapper via apiFetch → GET /api/users/:id',
      'POST /users axios → POST /users',
    ]);
  });

  test('fetch с query, ky с prefixUrl, билдер запроса для client.request', () => {
    expect(callsIn(ORDERS_SCREEN)).toEqual([
      'GET /users/:userId/posts wrapper via client.request → GET /users/:id/posts',
      'GET /v1/orders/count fetch → GET /v1/orders/count',
      'POST /orders ky → POST /orders',
    ]);
  });

  test('Eden treaty с базой из .env и Hono RPC', () => {
    expect(callsIn(PROFILE_SCREEN)).toEqual([
      'GET /api/users eden → GET /api/users',
      'GET /api/users/:id eden → GET /api/users/:id',
      'GET /health hono-rpc → GET /health',
      'POST /orders hono-rpc → POST /orders',
    ]);
  });

  test('вызов без роута остаётся несопоставленным', () => {
    expect(callsIn(USERS_SCREEN)).toEqual(['GET /api/unknown-thing fetch → нет роута']);
  });

  test('внутри обёрток нет ложных вызовов с путём-параметром', () => {
    expect(callsIn('apps/web/src/lib/api.ts')).toEqual([]);
  });

  test('вызов принадлежит сервису своего файла', () => {
    const call = (code.apiCalls ?? []).find((c) => c.location.file === PROFILE_SCREEN);
    expect(call?.serviceId).toBe('service:@fx/miniapp');
  });
});

describe('scanSource: экраны → вызовы', () => {
  test('экран получает вызовы из хука, дочернего компонента и своего файла', () => {
    expect(screenCalls(USERS_SCREEN)).toEqual([
      'DELETE /api/admin/users/:id ← UserRow',
      'GET /api/unknown-thing',
      'GET /api/users ← useUsers',
    ]);
  });

  test('экран заказов: прямые вызовы и вызов через функцию', () => {
    expect(screenCalls(ORDERS_SCREEN)).toEqual([
      'GET /users/:userId/posts',
      'GET /v1/orders/count',
      'POST /orders',
      'POST /users ← createUser',
    ]);
  });

  test('без entries экранов нет', () => {
    expect(scanSource({ root: FIXTURE }).code.screens).toBeUndefined();
  });
});
