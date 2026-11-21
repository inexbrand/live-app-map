/**
 * Вход и доступ роутов на фикстуре fixtures/source-guarded: схемы Elysia `t.*`
 * и zod (zValidator Hono), роли из сравнений, права из проверок и плагинов цепочки.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ApiRoute, CodeModel, RouteInputSchema, RouteSchemaField } from '@live-app-map/schema';
import { scanSource } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-guarded');

let code: CodeModel;

beforeAll(() => {
  code = scanSource({ root: FIXTURE }).code;
});

function route(method: string, routePath: string): ApiRoute {
  const found = code.routes.find((r) => r.method === method && r.path === routePath);
  if (found === undefined) {
    throw new Error(`нет роута ${method} ${routePath}; есть: ${code.routes.map((r) => `${r.method} ${r.path}`).join(', ')}`);
  }
  return found;
}

/** Поля схемы строкой «имя?: тип». */
function fields(s: RouteInputSchema | undefined): string[] {
  return (s?.fields ?? []).map((f) => `${f.name}${f.optional === true ? '?' : ''}: ${f.type}`);
}

/** Дерево полей строками с отступом вложенности и правилами. */
function tree(list: readonly RouteSchemaField[] | undefined, pad = ''): string[] {
  return (list ?? []).flatMap((f) => [
    `${pad}${f.name}${f.optional === true ? '?' : ''}: ${f.type}${f.rules === undefined ? '' : ` [${f.rules.join(', ')}]`}`,
    ...tree(f.fields, `${pad}  `),
  ]);
}

describe('вход роута', () => {
  test('Elysia: params из t.Object в опциях', () => {
    const r = route('GET', '/api/me/vacancies/:vacancyId');
    expect(r.input?.params?.kind).toBe('typebox');
    expect(fields(r.input?.params)).toEqual(['vacancyId: string']);
    expect(r.input?.body).toBeUndefined();
  });

  test('Elysia: body по имени константы — поля, необязательные, массив, союз литералов', () => {
    const r = route('POST', '/api/admin/vacancies');
    expect(r.input?.body?.name).toBe('CreateVacancyBody');
    expect(fields(r.input?.body)).toEqual([
      "level: 'junior' | 'senior'",
      'title: string',
      'salary?: number',
      'tags: string[]',
      "status: 'draft' | 'open'",
    ]);
    expect(fields(r.input?.query)).toEqual(['dryRun?: boolean']);
  });

  test('Hono: zValidator json → body из z.object', () => {
    const r = route('POST', '/api/hono/items');
    expect(r.input?.body?.kind).toBe('zod');
    expect(fields(r.input?.body)).toEqual(['name: string', 'count?: number', "kind: 'a' | 'b'"]);
  });

  test('Elysia: t.Optional(t.Object) — поля, вложенные объекты по имени, массив объектов', () => {
    const body = route('POST', '/api/admin/broadcasts').input?.body;
    expect(body?.optional).toBe(true);
    expect(body?.text).toBeUndefined();
    expect(tree(body?.fields)).toEqual([
      'audience?: AudienceFilter',
      "  roles: ('recruiter' | 'employer')[]",
      '  city?: object',
      '    id: string [format uuid]',
      'recipients: object[]',
      '  id: string [minLength 1]',
      '  weight?: number [minimum 0]',
      "markup: 'html' | 'markdown'",
    ]);
  });

  test('Elysia: t.Record, t.Unknown, t.Partial — тип части и необязательные поля', () => {
    expect(route('GET', '/api/admin/registry/:name').input?.query?.type).toBe('record<string, string>');
    expect(route('PATCH', '/api/admin/presets/:id').input?.body?.type).toBe('unknown');
    expect(fields(route('PUT', '/api/admin/profile').input?.body)).toEqual(['name?: string', 'age?: number']);
  });

  test('Hono: вложенный z.object в массиве и правила цепочки', () => {
    expect(tree(route('POST', '/api/hono/orders').input?.body?.fields)).toEqual([
      'lines: object[]',
      '  sku: string [max 32]',
      '  qty: number [int, min 1]',
      'note?: string',
    ]);
  });

  test('роут без схем — без input', () => {
    expect(route('GET', '/api/public/health').input).toBeUndefined();
  });
});

describe('доступ роута', () => {
  test('роли из сравнений viewer.role и вход по UNAUTHORIZED', () => {
    const a = route('GET', '/api/me/vacancies/:vacancyId').access;
    expect(a?.auth).toBe(true);
    expect(a?.roles).toEqual(['admin', 'employer']);
  });

  test('права из функции-проверки и её вложенных вызовов', () => {
    const a = route('POST', '/api/admin/vacancies').access;
    expect(a?.checks).toEqual(['requireAdminAccess', 'requirePermission']);
    expect(a?.permissions).toEqual(['admin.access', 'admin.vacancies.write']);
    expect(a?.auth).toBe(true);
  });

  test('плагин доступа в цепочке до роута действует на роут, но не на роуты до него', () => {
    expect(route('GET', '/api/admin/reports').access?.permissions).toEqual(['reports.read']);
    expect(route('GET', '/api/public/health').access).toBeUndefined();
  });
});
