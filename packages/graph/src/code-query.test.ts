/**
 * Запросы к разделу code: роуты, таблицы, связи, экраны-вызывающие.
 */
import { describe, expect, test } from 'bun:test';
import type { AppMapDocument, CodeModel } from '@live-app-map/schema';
import { buildCodeIndex, findRoutes, findTable, routeDetail, serviceSummaries, shortSummary, tableDetail } from './code-query';

const loc = (file: string, line = 1) => ({ file, line });

const code: CodeModel = {
  root: '/repo',
  services: [
    { id: 'service:api', name: '@x/api', root: 'apps/api' },
    { id: 'service:db', name: '@x/db', root: 'packages/db' },
    { id: 'service:web', name: '@x/web', root: 'apps/web' },
  ],
  symbols: [],
  routes: [
    {
      id: 'api:@x/api GET /users/:id',
      framework: 'elysia',
      method: 'GET',
      path: '/users/:id',
      serviceId: 'service:api',
      location: loc('apps/api/users.ts', 3),
      handler: { location: loc('apps/api/users.ts', 3) },
      doc: 'Профиль пользователя.\nВторая строка.',
      dbCalls: [
        { orm: 'drizzle', operation: 'select', table: 'users', location: loc('apps/api/users.ts', 5) },
        { orm: 'drizzle', operation: 'select', table: 'posts', location: loc('apps/api/users.ts', 6), inLoop: true },
      ],
    },
    {
      id: 'api:@x/api POST /posts',
      framework: 'elysia',
      method: 'POST',
      path: '/posts',
      serviceId: 'service:api',
      location: loc('apps/api/posts.ts', 3),
      handler: { location: loc('apps/api/posts.ts', 3) },
      dbCalls: [{ orm: 'drizzle', operation: 'insert', table: 'posts', location: loc('apps/api/posts.ts', 4) }],
    },
  ],
  tables: [
    {
      id: 'table:drizzle:users',
      orm: 'drizzle',
      name: 'users',
      exportName: 'users',
      serviceId: 'service:db',
      location: loc('packages/db/schema.ts'),
      doc: 'Пользователи.',
      columns: [{ name: 'id', type: 'uuid', primaryKey: true, notNull: true }],
    },
    {
      id: 'table:drizzle:posts',
      orm: 'drizzle',
      name: 'blog_posts',
      exportName: 'posts',
      serviceId: 'service:db',
      location: loc('packages/db/schema.ts', 9),
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, notNull: true },
        { name: 'authorId', sqlName: 'author_id', type: 'uuid', references: { table: 'users', column: 'id', onDelete: 'cascade' } },
      ],
    },
  ],
  apiCalls: [
    { id: 'c1', serviceId: 'service:web', method: 'GET', path: '/users/:id', client: 'fetch', location: loc('apps/web/profile.tsx'), routeId: 'api:@x/api GET /users/:id' },
  ],
  screens: [{ nodeId: 'web:/profile', file: 'apps/web/profile.tsx', calls: [{ callId: 'c1', via: 'useProfile' }] }],
};

const doc: AppMapDocument = {
  formatVersion: 2,
  kind: 'live-app-map',
  generatedAt: '2026-11-21T00:00:00.000Z',
  generator: { name: 't', version: '0' },
  revision: 'r',
  project: { root: '/repo/apps/web', framework: 'next' },
  baseUrl: null,
  nodes: [{ id: 'web:/profile', kind: 'page', title: 'Профиль', pathPattern: '/profile' }],
  edges: [],
  code,
};

describe('code-query', () => {
  const index = buildCodeIndex(doc);

  test('сервисы: число роутов, таблиц, экранов-вызывающих', () => {
    expect(serviceSummaries(index)).toEqual([
      { id: 'service:api', name: '@x/api', root: 'apps/api', routes: 2, tables: 0, symbols: 0 },
      { id: 'service:db', name: '@x/db', root: 'packages/db', routes: 0, tables: 2, symbols: 0 },
      { id: 'service:web', name: '@x/web', root: 'apps/web', routes: 0, tables: 0, symbols: 0 },
    ]);
  });

  test('поиск роутов по сервису (имя или id) и подстроке пути/описания', () => {
    expect(findRoutes(index, { service: '@x/api' }).map((r) => r.id)).toEqual([
      'api:@x/api GET /users/:id',
      'api:@x/api POST /posts',
    ]);
    expect(findRoutes(index, { query: 'профиль' }).map((r) => r.path)).toEqual(['/users/:id']);
    expect(findRoutes(index, { service: 'нет такого' })).toEqual([]);
  });

  test('роут по id или «METHOD /path»: описание, чтение/запись таблиц, N+1, экраны', () => {
    const byText = routeDetail(index, 'get /users/:id');
    expect(byText?.route.id).toBe('api:@x/api GET /users/:id');
    expect(byText?.service?.name).toBe('@x/api');
    expect(byText?.reads).toEqual([
      { table: 'posts', dbName: 'blog_posts', operations: ['select'], count: 1, inLoop: true },
      { table: 'users', dbName: 'users', operations: ['select'], count: 1, inLoop: false },
    ]);
    expect(byText?.writes).toEqual([]);
    expect(byText?.callers).toEqual([{ nodeId: 'web:/profile', title: 'Профиль', file: 'apps/web/profile.tsx', via: 'useProfile' }]);
    expect(routeDetail(index, 'api:@x/api POST /posts')?.writes.map((w) => w.table)).toEqual(['posts']);
    expect(routeDetail(index, 'DELETE /nope')).toBeUndefined();
  });

  test('таблица по имени в коде или в БД: колонки, связи в обе стороны, кто читает и пишет', () => {
    const posts = tableDetail(index, 'blog_posts');
    expect(posts?.table.exportName).toBe('posts');
    expect(posts?.references).toEqual([{ column: 'authorId', table: 'users', targetColumn: 'id', onDelete: 'cascade' }]);
    expect(posts?.referencedBy).toEqual([]);
    expect(posts?.readBy.map((r) => r.id)).toEqual(['api:@x/api GET /users/:id']);
    expect(posts?.writtenBy.map((r) => r.id)).toEqual(['api:@x/api POST /posts']);
    const users = tableDetail(index, 'users');
    expect(users?.referencedBy).toEqual([{ table: 'posts', column: 'authorId', targetColumn: 'id', onDelete: 'cascade' }]);
    expect(findTable(index, 'nope')).toBeUndefined();
  });
});

describe('shortSummary', () => {
  test('убирает повтор метода и пути; абзац из ссылок на спеку дополняет следующим', () => {
    expect(shortSummary('`POST /api/v1/x` — блок\n054-взять.md §2/§4.\n\nБерёт вакансию в работу.')).toBe(
      'блок 054-взять.md §2/§4. Берёт вакансию в работу.',
    );
    expect(shortSummary('Профиль пользователя.\nВторая строка.\n\nДетали.')).toBe('Профиль пользователя. Вторая строка.');
    expect(shortSummary(undefined, ['Список заказов.'])).toBe('Список заказов.');
    expect(shortSummary(undefined)).toBeUndefined();
  });
});
