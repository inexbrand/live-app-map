/**
 * Сканер исходников на фикстуре fixtures/source-monorepo (Elysia, Hono, Express,
 * Drizzle, Prisma, React).
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ApiRoute, CodeModel } from '@live-app-map/schema';
import { codeServiceNodes, scanSource } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-monorepo');

let code: CodeModel;

beforeAll(() => {
  code = scanSource({ root: FIXTURE }).code;
});

/**
 * Находит роут по методу и пути или падает с понятным текстом.
 */
function route(method: string, routePath: string): ApiRoute {
  const found = code.routes.find((r) => r.method === method && r.path === routePath);
  if (found === undefined) {
    const have = code.routes.map((r) => `${r.method} ${r.path}`).join(', ');
    throw new Error(`нет роута ${method} ${routePath}; есть: ${have}`);
  }
  return found;
}

/** Таблицы вызовов БД роута в виде «операция таблица [через]». */
function dbOf(r: ApiRoute): string[] {
  return r.dbCalls
    .map((c) => `${c.operation} ${c.table}${c.via === undefined ? '' : ` via ${c.via}`}`)
    .sort();
}

describe('scanSource: сервисы', () => {
  test('сервис — пакет с package.json, у которого есть файлы', () => {
    expect(code.services.map((s) => s.name).sort()).toEqual([
      '@fx/api',
      '@fx/db',
      '@fx/express',
      '@fx/hono',
      '@fx/web',
    ]);
    expect(code.services.find((s) => s.name === '@fx/api')?.root).toBe('apps/api');
  });

  test('codeServiceNodes даёт ноду service на каждый сервис с числом роутов', () => {
    const nodes = codeServiceNodes(code);
    const api = nodes.find((n) => n.title === '@fx/api');
    expect(api?.kind).toBe('service');
    expect(api?.metadata?.['routes']).toBe(5);
    expect(api?.iframePolicy?.enabled).toBe(false);
  });
});

describe('scanSource: Elysia', () => {
  test('префикс из new Elysia({ prefix }) и путь из константы', () => {
    const r = route('GET', '/api/users');
    expect(r.framework).toBe('elysia');
    expect(r.doc).toBe('Список пользователей с постами.');
    expect(r.location).toEqual({ file: 'apps/api/src/users.ts', line: 18 });
    expect(dbOf(r)).toEqual(['select posts', 'select users']);
  });

  test('вызов БД через импортированную функцию помечен via', () => {
    const r = route('GET', '/api/users/:id');
    expect(r.doc).toBe('Карточка пользователя по id.');
    expect(dbOf(r)).toEqual(['select users via findUserById']);
  });

  test('.group добавляет префикс, вызовы БД в обработчике и в функции файла', () => {
    const r = route('DELETE', '/api/admin/users/:id');
    expect(r.doc).toBeUndefined();
    expect(dbOf(r)).toEqual(['delete posts via purgePosts', 'delete users']);
  });

  test('именованный обработчик: описание из его JSDoc', () => {
    const r = route('POST', '/users');
    expect(r.handler.name).toBe('createUser');
    expect(r.handler.location.line).toBe(36);
    expect(r.doc).toBe('Создаёт пользователя.');
    expect(dbOf(r)).toEqual(['insert users']);
  });
});

describe('scanSource: репозиторий за интерфейсом', () => {
  test('вызов метода интерфейса доходит до запроса в реализации-фабрике', () => {
    const r = route('GET', '/users/:id/posts');
    expect(r.doc).toBe('Посты автора.');
    expect(dbOf(r)).toEqual(['select posts via PostRepository.listByAuthor']);
  });
});

describe('scanSource: Hono и Express + Prisma', () => {
  test('Hono: комментарий над вызовом и Prisma create', () => {
    expect(route('GET', '/health').doc).toBe('Проверка живости.');
    const r = route('POST', '/orders');
    expect(r.framework).toBe('hono');
    expect(r.doc).toBe('Оформляет заказ.');
    expect(dbOf(r)).toEqual(['insert Order']);
  });

  test('Express: router смонтирован через app.use, обработчик — последний аргумент', () => {
    const count = route('GET', '/v1/orders/count');
    expect(count.framework).toBe('express');
    expect(count.doc).toBe('Число заказов.');
    expect(dbOf(count)).toEqual(['count Order']);
    const del = route('DELETE', '/orders/:id');
    // Обычный комментарий у вызова становится описанием и не дублируется в comments.
    expect(del.doc).toBe('Отменяет заказ.');
    expect(del.comments).toBeUndefined();
    expect(del.handler.name).toBeUndefined();
    expect(dbOf(del)).toEqual(['delete Order']);
  });
});

describe('scanSource: таблицы', () => {
  test('Drizzle pgTable: имя в БД, колонки с типом и именем колонки, JSDoc', () => {
    const t = code.tables.find((x) => x.exportName === 'users');
    expect(t?.orm).toBe('drizzle');
    expect(t?.name).toBe('users');
    expect(t?.doc).toBe('Пользователи сервиса. Одна строка — один аккаунт.');
    expect(t?.columns).toEqual([
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'text' },
      { name: 'createdAt', sqlName: 'created_at', type: 'timestamp' },
    ]);
    const posts = code.tables.find((x) => x.exportName === 'posts');
    expect(posts?.name).toBe('blog_posts');
    expect(posts?.comments).toEqual(['Посты пользователей.']);
  });

  test('таблица без своего JSDoc берёт шапку файла, если таблица в файле одна', () => {
    const t = code.tables.find((x) => x.exportName === 'comments');
    expect(t?.doc).toBe('Таблица `comments` — комментарии к постам.');
  });

  test('Prisma model: @@map, @map, /// описание', () => {
    const t = code.tables.find((x) => x.exportName === 'Order');
    expect(t?.orm).toBe('prisma');
    expect(t?.name).toBe('orders');
    expect(t?.doc).toBe('Заказ покупателя.');
    expect(t?.serviceId).toBe('service:@fx/db');
    expect(t?.columns).toEqual([
      { name: 'id', type: 'Int' },
      { name: 'total', type: 'Int' },
      { name: 'note', type: 'String?' },
      { name: 'userId', sqlName: 'user_id', type: 'String' },
    ]);
  });
});

describe('scanSource: символы', () => {
  test('экспорт функций, компонентов, классов, интерфейсов с комментариями', () => {
    const web = code.symbols
      .filter((s) => s.location.file.startsWith('apps/web/'))
      .map((s) => [s.kind, s.name, s.location.line, s.doc ?? s.comments?.[0] ?? '']);
    expect(web).toEqual([
      ['component', 'UserCard', 4, 'Карточка пользователя: имя и почта.'],
      ['function', 'formatName', 9, 'Форматирует имя для заголовка.'],
      ['class', 'ProfileStore', 12, 'Состояние формы профиля.'],
      ['interface', 'UserCardProps', 17, 'Пропсы карточки.'],
    ]);
  });

  test('JSDoc с тегами и сигнатура функции', () => {
    const s = code.symbols.find((x) => x.name === 'findUserById');
    expect(s?.doc).toBe('Ищет пользователя по id.\n\n@param id - id пользователя');
    expect(s?.signature).toBe('(id: string) => Promise<unknown>');
    expect(s?.serviceId).toBe('service:@fx/api');
  });
});
