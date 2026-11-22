/**
 * Путь вызова API из частей и выбор роута бэкенда: литералы, база env, параметры,
 * обёртки, ассеты, внешние хосты, query-хвост; очки совпадения и wildcard.
 */
import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import { matchRoute, normalizeApiPath } from './api-match';
import type { Part } from './api-value';

const origin = ts.factory.createIdentifier('x');
const lit = (text: string): Part => ({ kind: 'lit', text, origin });
const dyn = (name: string): Part => ({ kind: 'dyn', name, origin });
const param = (name: string): Part => ({ kind: 'param', name, origin });
const env = (name: string, base: string | undefined): Part => ({ kind: 'env', name, base, origin });

describe('normalizeApiPath', () => {
  test('литерал: без query и hash, двойной слэш склеен; относительный путь — не наш', () => {
    expect(normalizeApiPath([lit('/api/users?page=1')])).toBe('/api/users');
    expect(normalizeApiPath([lit('/api/users#top')])).toBe('/api/users');
    expect(normalizeApiPath([lit('/api//users')])).toBe('/api/users');
    expect(normalizeApiPath([lit('api/users')])).toBeUndefined();
  });

  test('база env только первой частью; нет переменной — пусто; env в середине — сегмент-параметр', () => {
    expect(normalizeApiPath([env('API', '/v1'), lit('/users')])).toBe('/v1/users');
    expect(normalizeApiPath([env('API', undefined), lit('/users')])).toBe('/users');
    expect(normalizeApiPath([lit('/a/'), env('ID', '/zz')])).toBe('/a/:ID');
  });

  test('параметр-адрес — обёртка; прочий параметр — сегмент; параметр внутри сегмента — не путь', () => {
    expect(normalizeApiPath([param('url')])).toBeUndefined();
    expect(normalizeApiPath([param('endpointPath')])).toBeUndefined();
    expect(normalizeApiPath([lit('/u/'), param('id')])).toBe('/u/:id');
    expect(normalizeApiPath([lit('/u/a'), param('id')])).toBeUndefined();
    expect(normalizeApiPath([lit('/u/'), dyn('url')])).toBe('/u/:url');
  });

  test('неизвестное начало перед «/…» — origin; без «/» после — путь не задан', () => {
    expect(normalizeApiPath([dyn('origin'), lit('/api/x')])).toBe('/api/x');
    expect(normalizeApiPath([param('base'), lit('/api/x')])).toBe('/api/x');
    expect(normalizeApiPath([dyn('origin'), lit('api')])).toBeUndefined();
    expect(normalizeApiPath([dyn('a')])).toBeUndefined();
    expect(normalizeApiPath([dyn('a'), dyn('b')])).toBeUndefined();
  });

  test('неизвестные сегменты — по именам по порядку; хвост последнего сегмента — query', () => {
    expect(normalizeApiPath([lit('/a/'), dyn('x'), lit('/b/'), dyn('y')])).toBe('/a/:x/b/:y');
    expect(normalizeApiPath([lit('/items'), dyn('query')])).toBe('/items');
    expect(normalizeApiPath([lit('/a'), dyn('q'), lit('/b')])).toBe('/:q/b');
    expect(normalizeApiPath([lit('/u/'), dyn('user.id')])).toBe('/u/:userid');
    expect(normalizeApiPath([lit('/u/'), dyn('$')])).toBe('/u/:$');
    expect(normalizeApiPath([lit('/u/'), dyn('..')])).toBe('/u/:param');
  });

  test('ассет по последнему сегменту и чужой хост — не наш API; localhost — наш', () => {
    expect(normalizeApiPath([lit('/static/app.js')])).toBeUndefined();
    expect(normalizeApiPath([lit('/api/data.json')])).toBeUndefined();
    expect(normalizeApiPath([lit('/a.js/x')])).toBe('/a.js/x');
    expect(normalizeApiPath([lit('https://example.com/api')])).toBeUndefined();
    expect(normalizeApiPath([lit('http://localhost:3000/api/x')])).toBe('/api/x');
    expect(normalizeApiPath([lit('http://127.0.0.1/api/x')])).toBe('/api/x');
  });
});

/** Роут с методом и путём. */
function route(method: HttpMethod | 'ALL', p: string): ApiRoute {
  const location = { file: 'r.ts', line: 1 };
  return { id: `${method} ${p}`, framework: 'express', method, path: p, serviceId: 's', location, handler: { location }, dbCalls: [] };
}

describe('matchRoute', () => {
  const id = (method: HttpMethod, p: string, routes: ApiRoute[]) => matchRoute(method, p, routes)?.id;

  test('метод совпадает или роут на любой метод', () => {
    expect(id('GET', '/u', [route('POST', '/u')])).toBeUndefined();
    expect(id('GET', '/u', [route('POST', '/u'), route('ALL', '/u')])).toBe('ALL /u');
  });

  test('литерал важнее параметра; параметр вызова — в параметр роута; {id} — параметр, «{id» — нет', () => {
    expect(id('GET', '/u/me', [route('GET', '/u/:id'), route('GET', '/u/me')])).toBe('GET /u/me');
    expect(id('GET', '/u/:id', [route('GET', '/u/me'), route('GET', '/u/{id}')])).toBe('GET /u/{id}');
    expect(id('GET', '/u/5', [route('GET', '/u/{id')])).toBeUndefined();
    expect(id('GET', '/u/5/x', [route('GET', '/u/:id')])).toBeUndefined();
  });

  test('равные очки — первый роут; литерал в параметр — 1 очко, не 0', () => {
    expect(id('GET', '/a/b/c', [route('GET', '/a/:x/c'), route('GET', '/a/b/:y')])).toBe('GET /a/:x/c');
    expect(id('GET', '/a/b/c', [route('GET', '/:x/:y/:z'), route('GET', '/a/*')])).toBe('GET /:x/:y/:z');
  });

  test('wildcard: хвост любой длины, в том числе пустой', () => {
    expect(id('GET', '/files/a/b', [route('GET', '/files/*')])).toBe('GET /files/*');
    expect(id('GET', '/files', [route('GET', '/files/*')])).toBe('GET /files/*');
    expect(id('GET', '/other', [route('GET', '/files/*')])).toBeUndefined();
    expect(id('GET', '/a/x', [route('GET', '/a/b/*')])).toBeUndefined();
  });
});
