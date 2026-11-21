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
const RR_CONFIG = 'apps/miniapp/src/routes.tsx';
const ADMIN_CONFIG = 'apps/admin/src/route-config.ts';
const RR_SCREENS = [
  { file: RR_CONFIG, nodeId: 'route:/profile/:id', routePath: '/profile/:id' },
  { file: RR_CONFIG, nodeId: 'route:/orders', routePath: '/orders' },
  { file: RR_CONFIG, nodeId: 'route:/wallet', routePath: '/wallet' },
  // TanStack Router: файл экрана — сам компонент, объекта роута в нём нет.
  {
    file: 'apps/miniapp/src/screens/Settings.tsx',
    nodeId: 'route:/settings',
    routePath: '/settings',
    routeFile: 'apps/miniapp/src/tanstack-routes.tsx',
  },
  // Один файл страницы на два маршрута (`/plans/new` и `/plans/[code]`).
  { file: 'apps/miniapp/src/screens/Settings.tsx', nodeId: 'route:/settings/advanced', routePath: '/settings/advanced' },
  // Админка: конфиг — только данные, компонент выбирает switch по разделу пути.
  { file: ADMIN_CONFIG, nodeId: 'admin:/users', routePath: '/users' },
  { file: ADMIN_CONFIG, nodeId: 'admin:/users/[id]', routePath: '/users/[id]' },
  { file: ADMIN_CONFIG, nodeId: 'admin:/audit', routePath: '/audit' },
];

let code: CodeModel;

beforeAll(() => {
  code = scanSource({
    root: FIXTURE,
    entries: [{ file: USERS_SCREEN }, { file: ORDERS_SCREEN }, ...RR_SCREENS],
  }).code;
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
function screenCalls(key: string): string[] {
  const screen = code.screens?.find((s) => s.nodeId === key) ?? code.screens?.find((s) => s.file === key);
  if (screen === undefined) {
    throw new Error(`нет экрана ${key}`);
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

  test('origin параметром функции перед литералом пути — вызов в этой функции', () => {
    expect(callsIn('apps/miniapp/src/stores/cards.ts')).toEqual(['POST /api/cards/auto-renew fetch → нет роута']);
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

  test('React Router: element и lazy через карту загрузчиков ведут к компонентам экранов', () => {
    expect(screenCalls('route:/profile/:id')).toEqual([
      'GET /api/users ← Profile',
      'GET /api/users/:id ← Profile',
      'GET /health ← Profile',
      'GET /v1/me ← Profile',
      'POST /orders ← Profile',
    ]);
    expect(screenCalls('route:/orders')).toEqual([
      'DELETE /v1/orders-store/:id ← createOrdersStore',
      'GET /v1/orders-store ← load',
      'GET /v1/orders/count',
    ]);
  });

  test('таб без элемента: экран берётся из карты загрузчиков по id роута', () => {
    expect(screenCalls('route:/wallet')).toContain('GET /v1/wallet ← createWalletStore');
  });

  test('стор-фабрика экрана обходится целиком, даже если тип стора не виден', () => {
    expect(screenCalls('route:/wallet')).toEqual([
      'GET /v1/me ← me',
      'GET /v1/wallet ← createWalletStore',
      'POST /v1/wallet/top-up ← createWalletStore',
    ]);
  });

  test('общая фабрика многих экранов целиком не обходится: экрану — только его методы', () => {
    for (const key of ['route:/profile/:id', 'route:/wallet', 'route:/settings']) {
      expect(screenCalls(key).some((c) => c.startsWith('GET /v1/me'))).toBe(true);
      expect(screenCalls(key).some((c) => c.startsWith('GET /v1/ping'))).toBe(false);
    }
  });

  test('метод по имени (тип получателя не виден) не берётся из чужого стора', () => {
    expect(screenCalls('route:/wallet').some((c) => c.includes('/v1/orders-store'))).toBe(false);
  });

  test('TanStack Router: файл экрана без объекта роута обходится сам', () => {
    expect(screenCalls('route:/settings')).toContain('GET /v1/settings');
  });

  test('TanStack Router: loader маршрута в файле конфига — тоже вызовы экрана', () => {
    expect(screenCalls('route:/settings')).toContain('GET /v1/settings/defaults ← loadSettings');
  });

  test('файл страницы на два маршрута без диспетчера обходится для обоих', () => {
    expect(screenCalls('route:/settings/advanced')).toEqual(['GET /v1/me ← me', 'GET /v1/profile ← fetchProfile', 'GET /v1/settings']);
  });

  test('клиент из контекста (создан оболочкой): метод по имени берётся из него', () => {
    expect(screenCalls('route:/settings')).toEqual([
      'GET /v1/me ← me',
      'GET /v1/profile ← fetchProfile',
      'GET /v1/settings',
      'GET /v1/settings/defaults ← loadSettings',
    ]);
  });

  test('админка без компонентов в конфиге: экран находится по switch на раздел пути', () => {
    expect(screenCalls('admin:/users')).toEqual(['GET /api/admin/activity ← UsersPage', 'GET /api/admin/users ← UsersPage']);
    expect(screenCalls('admin:/users/[id]')).toEqual(['GET /api/admin/activity ← UsersPage', 'GET /api/admin/users ← UsersPage']);
    expect(screenCalls('admin:/audit')).toEqual(['GET /api/admin/audit ← AuditPage']);
  });

  test('без entries экранов нет', () => {
    expect(scanSource({ root: FIXTURE }).code.screens).toBeUndefined();
  });
});
