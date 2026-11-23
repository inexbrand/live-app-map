/**
 * Домены API: аудитории (admin, employer, recruiter) узнаются по данным и в домены не попадают.
 */
import { describe, expect, test } from 'bun:test';
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import { apiDomains } from './api-domains';

function route(method: HttpMethod, path: string): ApiRoute {
  const loc = { file: 'api.ts', line: 1 };
  return { id: `${method} ${path}`, framework: 'elysia', method, path, serviceId: 's', location: loc, handler: { location: loc }, dbCalls: [] };
}

const ROUTES: readonly ApiRoute[] = [
  route('GET', '/api/v1/admin/vacancies'),
  route('GET', '/api/v1/admin/deals/:id'),
  route('GET', '/api/v1/admin/metrics'),
  route('GET', '/api/v1/recruiter/vacancies'),
  route('POST', '/api/v1/recruiter/deals/:id/report'),
  route('POST', '/api/v1/auth/admin/login'),
  route('POST', '/api/v1/auth/telegram'),
  route('GET', '/api/v1/me'),
  route('GET', '/health'),
];

describe('apiDomains', () => {
  test('модуль под аудиторией — домен; auth с одним общим модулем — сам домен', () => {
    const d = apiDomains(ROUTES);
    expect(d.map((x) => `${x.name}:${x.routes.length}`)).toEqual(['auth:2', 'deals:2', 'health:1', 'me:1', 'metrics:1', 'vacancies:2']);
    expect(d.find((x) => x.name === 'vacancies')?.routes.map((r) => r.path)).toEqual(['/api/v1/admin/vacancies', '/api/v1/recruiter/vacancies']);
  });

  test('аудитории считаются по всем роутам: фильтр не меняет домен', () => {
    const one = ROUTES.filter((r) => r.path === '/api/v1/recruiter/vacancies');
    expect(apiDomains(one, ROUTES).map((x) => x.name)).toEqual(['vacancies']);
    expect(apiDomains(one).map((x) => x.name)).toEqual(['recruiter']);
  });

  test('без роутов — пусто', () => {
    expect(apiDomains([])).toEqual([]);
  });
});
