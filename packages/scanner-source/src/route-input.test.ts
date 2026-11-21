/**
 * Полная схема входа роута на фикстуре fixtures/source-schemas: необязательная часть,
 * вложенные объекты (и по имени константы), массивы объектов, t.Record/t.Unknown/t.Partial,
 * правила из опций TypeBox и цепочки zod.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ApiRoute, CodeModel, RouteSchemaField } from '@live-app-map/schema';
import { scanSource } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-schemas');

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

/** Дерево полей строками с отступом вложенности и правилами. */
function tree(list: readonly RouteSchemaField[] | undefined, pad = ''): string[] {
  return (list ?? []).flatMap((f) => [
    `${pad}${f.name}${f.optional === true ? '?' : ''}: ${f.type}${f.rules === undefined ? '' : ` [${f.rules.join(', ')}]`}`,
    ...tree(f.fields, `${pad}  `),
  ]);
}

describe('полная схема входа', () => {
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

  test('Elysia: t.Record, t.Unknown — тип части; t.Partial — все поля необязательные', () => {
    expect(route('GET', '/api/admin/registry/:name').input?.query?.type).toBe('record<string, string>');
    expect(route('PATCH', '/api/admin/presets/:id').input?.body?.type).toBe('unknown');
    expect(tree(route('PUT', '/api/admin/profile').input?.body?.fields)).toEqual(['name?: string', 'age?: number']);
  });

  test('Hono: вложенный z.object в массиве и правила цепочки', () => {
    expect(tree(route('POST', '/api/hono/orders').input?.body?.fields)).toEqual([
      'lines: object[]',
      '  sku: string [max 32]',
      '  qty: number [int, min 1]',
      'note?: string',
    ]);
  });
});
