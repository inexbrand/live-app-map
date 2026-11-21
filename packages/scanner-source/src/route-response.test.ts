/**
 * Ответ обработчика на фикстуре: поля литерала, возвращаемые значения, статусы
 * в Elysia, Hono и Express.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { CodeModel } from '@live-app-map/schema';
import { scanSource } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-monorepo');

let code: CodeModel;

beforeAll(() => {
  code = scanSource({ root: FIXTURE }).code;
});

function responseOf(method: string, routePath: string): unknown {
  const route = code.routes.find((r) => r.method === method && r.path === routePath);
  if (route === undefined) {
    throw new Error(`нет роута ${method} ${routePath}`);
  }
  return route.response;
}

describe('scanSource: ответ роута', () => {
  test('Elysia: поля возвращаемого объекта', () => {
    expect(responseOf('GET', '/api/users')).toEqual({ fields: ['rows', 'all'] });
    expect(responseOf('DELETE', '/api/admin/users/:id')).toEqual({ fields: ['ok'] });
  });

  test('Elysia: set.status и ветки ответа — поля ошибки, переменная, статус', () => {
    expect(responseOf('GET', '/api/users/:id')).toEqual({ fields: ['error'], values: ['user'], statuses: [404] });
  });

  test('Hono: c.json(переменная)', () => {
    expect(responseOf('POST', '/orders')).toEqual({ values: ['order'] });
  });

  test('Express: res.sendStatus(204)', () => {
    expect(responseOf('DELETE', '/orders/:id')).toEqual({ statuses: [204] });
  });
});
