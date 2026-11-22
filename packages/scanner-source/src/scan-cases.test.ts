/**
 * Случаи скана на маленьких проектах во временном каталоге: формы обработчика роута,
 * слияние схем TypeBox, составные ключи Drizzle, обёртки клиента API с объектом опций
 * и деструктурированным параметром.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiRoute, CodeModel } from '@live-app-map/schema';
import { scanSource } from './index';

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true });
  }
});

/** Сканирует проект-монорепо с одним сервисом apps/x из заданных файлов (пути от apps/x). */
function scan(files: Record<string, string>): CodeModel {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lam-scan-'));
  dirs.push(root);
  const all: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'fx', private: true, workspaces: ['apps/*'] }),
    'apps/x/package.json': JSON.stringify({ name: '@fx/x' }),
    ...Object.fromEntries(Object.entries(files).map(([f, text]) => [`apps/x/${f}`, text])),
  };
  for (const [f, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    writeFileSync(path.join(root, f), text);
  }
  return scanSource({ root }).code;
}

function route(code: CodeModel, method: string, routePath: string): ApiRoute {
  const found = code.routes.find((r) => r.method === method && r.path === routePath);
  if (found === undefined) {
    throw new Error(`нет роута ${method} ${routePath}; есть: ${code.routes.map((r) => `${r.method} ${r.path}`).join(', ')}`);
  }
  return found;
}

describe('обработчик роута по имени', () => {
  const code = scan({
    'src/server.ts': `import express from 'express';

/** Список заказов */
function list() {
  return { items: [] };
}

/** Создать заказ */
const create = async () => ({ id: 1 });

class Orders {
  /** Один заказ */
  show() {
    return { order: null };
  }
}

const orders = new Orders();
const app = express();
app.get('/orders', list);
app.post('/orders', create);
app.get('/orders/:id', orders.show);

export function mount(handler: () => unknown) {
  app.delete('/orders/:id', handler);
}
`,
  });

  test('функция, константа-стрелка и метод класса: имя, место и JSDoc обработчика', () => {
    const shown = ['GET /orders', 'POST /orders', 'GET /orders/:id'].map((key) => {
      const [method = '', p = ''] = key.split(' ');
      const r = route(code, method, p);
      return `${key} ${r.handler.name} :${r.handler.location.line} ${r.doc}`;
    });
    expect(shown).toEqual([
      'GET /orders list :4 Список заказов',
      'POST /orders create :9 Создать заказ',
      'GET /orders/:id show :13 Один заказ',
    ]);
  });

  test('параметр функции: имя есть, место — объявление параметра, описания нет', () => {
    const r = route(code, 'DELETE', '/orders/:id');
    expect(r.handler.name).toBe('handler');
    expect(r.handler.location.line).toBe(24);
    expect(r.doc).toBeUndefined();
  });
});

describe('слияние схем TypeBox', () => {
  test('t.Intersect и t.Composite: поля всех объектов по порядку', () => {
    const code = scan({
      'src/api.ts': `import { Elysia, t } from 'elysia';

const Base = t.Object({ id: t.String() });

export const app = new Elysia()
  .post('/a', () => ({}), { body: t.Intersect([Base, t.Object({ name: t.String(), age: t.Optional(t.Number()) })]) })
  .post('/b', () => ({}), { body: t.Composite([t.Object({ x: t.Boolean() })]) })
  .post('/c', () => ({}), { body: t.Intersect(parts) });

declare const parts: unknown[];
`,
    });
    const fields = (p: string): string[] => (route(code, 'POST', p).input?.body?.fields ?? []).map((f) => `${f.name}${f.optional === true ? '?' : ''}: ${f.type}`);
    expect(fields('/a')).toEqual(['id: string', 'name: string', 'age?: number']);
    expect(fields('/b')).toEqual(['x: boolean']);
    expect(route(code, 'POST', '/c').input?.body?.type).toBe('{}');
  });
});

describe('составные ключи Drizzle', () => {
  test('primaryKey и foreignKey третьего аргумента дополняют колонки', () => {
    const code = scan({
      'src/schema.ts': `import { pgTable, uuid, text, primaryKey, foreignKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', { id: uuid('id').primaryKey() });

export const memberships = pgTable(
  'memberships',
  { userId: uuid('user_id'), groupId: uuid('group_id'), note: text('note') },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.groupId] }),
    fk: foreignKey({ columns: [t.userId, t.note], foreignColumns: [users.id] }),
  }),
);
`,
    });
    const table = code.tables.find((t) => t.name === 'memberships');
    expect(table?.columns).toEqual([
      { name: 'userId', sqlName: 'user_id', type: 'uuid', primaryKey: true, notNull: true, references: { table: 'users', column: 'id' } },
      { name: 'groupId', sqlName: 'group_id', type: 'uuid', primaryKey: true, notNull: true },
      { name: 'note', type: 'text' },
    ]);
  });
});

describe('клиенты вызовом', () => {
  test('axios с объектом и строкой, fetch, пришедший параметром', () => {
    const code = scan({
      'src/calls.ts': `import axios from 'axios';

export async function run(fetchWithAuth: typeof fetch) {
  await axios({ method: 'post', url: '/api/a' });
  await axios('/api/b');
  await fetchWithAuth('/api/me', { method: 'PATCH' });
}
`,
    });
    expect((code.apiCalls ?? []).map((c) => `${c.method} ${c.path} ${c.client}`).sort()).toEqual([
      'GET /api/b axios',
      'PATCH /api/me fetch',
      'POST /api/a axios',
    ]);
  });
});

describe('обёртки клиента API', () => {
  const code = scan({
    'src/client.ts': `declare const api: { request(o: object): Promise<unknown>; getUser(p: string): Promise<unknown>; get(p: string, h?: unknown): Promise<unknown> };

export async function load(id: string) {
  await api.request({ path: '/api/orders', method: 'DELETE' });
  await api.request({ url: '/api/items' });
  await api.getUser('/api/users/' + id);
  await api.getUser(id);
  await api.get('/api/ping', () => null);
}

function send({ path, method }: { path: string; method: string }) {
  return fetch(path, { method });
}

export function save() {
  return send({ path: '/api/save', method: 'PUT' });
}
`,
  });
  const calls = (): string[] => (code.apiCalls ?? []).map((c) => `${c.method} ${c.path} ${c.client}${c.via === undefined ? '' : ` via ${c.via}`}`).sort();

  test('объект опций, глагол в имени метода, путь из деструктурированного параметра', () => {
    expect(calls()).toEqual([
      'DELETE /api/orders wrapper via api.request',
      'GET /api/items wrapper via api.request',
      'GET /api/users/:id wrapper via api.getUser',
      'PUT /api/save wrapper via send',
    ]);
  });
});
