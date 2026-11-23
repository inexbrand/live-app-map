/**
 * Вид «База данных» на собранной вручную схеме: признаки колонок, ссылки,
 * описание длиннее и ровно в предел, бейдж сервиса, роуты ровно в предел списка и сверх,
 * пустые списки чтения и записи, выбор первой таблицы по умолчанию.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { ApiRoute, CodeModel, DbTable } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { openMap, resetStores } from '../test/fixtures';
import { DatabaseView } from './DatabaseView';

useDom();

beforeEach(resetStores);

const LOC = { file: 'packages/db/src/schema.ts', line: 1 };

function table(exportName: string, extra: Partial<DbTable> = {}): DbTable {
  return { id: `table:drizzle:${exportName}`, orm: 'drizzle', name: exportName, exportName, serviceId: 'svc-нет-в-карте', location: LOC, columns: [{ name: 'id', type: 'text' }], ...extra };
}

function route(i: number, operation: 'select' | 'insert', tableName: string, doc?: string): ApiRoute {
  return {
    id: `r${tableName}${operation}${i}`,
    framework: 'elysia',
    method: operation === 'select' ? 'GET' : 'POST',
    path: `/${tableName}/${i}`,
    serviceId: 'svc-api',
    location: { file: 'apps/api/src/r.ts', line: i },
    handler: { location: { file: 'apps/api/src/r.ts', line: i } },
    dbCalls: [{ orm: 'drizzle', operation, table: tableName, location: { file: 'apps/api/src/r.ts', line: i } }],
    ...(doc === undefined ? {} : { doc }),
  };
}

const ORDERS = table('orders', {
  serviceId: 'svc-db',
  doc: 'о'.repeat(361),
  columns: [
    { name: 'id', type: 'uuid', primaryKey: true, notNull: true, default: 'gen()' },
    { name: 'code', sqlName: 'order_code', type: 'text', unique: true },
    { name: 'status', type: 'text', enumValues: ['new', 'paid'] },
    { name: 'userId', type: 'uuid', references: { table: 'users', column: 'id', onDelete: 'cascade' } },
    { name: 'managerId', type: 'uuid', references: { table: 'users', column: 'id' } },
  ],
});
const USERS = table('users', { doc: 'у'.repeat(360) });
const LOGS = table('logs');

const ROUTES: readonly ApiRoute[] = [
  ...Array.from({ length: 8 }, (_, i) => route(i, 'select', 'orders')),
  route(0, 'insert', 'orders', 'Создаёт заказ.'),
  ...Array.from({ length: 9 }, (_, i) => route(i, 'select', 'users')),
];

function show(selected: string | null) {
  const doc = openMap('korbor-miniapp');
  const code: CodeModel = { root: '/p', services: [{ id: 'svc-db', name: '@x/db', root: 'packages/db' }], symbols: [], routes: ROUTES, tables: [ORDERS, USERS, LOGS], apiCalls: [], screens: [] };
  act(() => {
    useAppStore.getState().loadDocument({ ...doc, code });
    useViewStore.getState().setView('database');
    if (selected !== null) {
      useViewStore.getState().openTable(selected);
    }
  });
  const r = render(<DatabaseView />);
  return within(r.container);
}

/** Строки таблицы колонок: ячейки через «|». */
function columns(ui: ReturnType<typeof within>): string[] {
  return [...ui.getByTestId('db-table').querySelectorAll('.db-view__columns tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent).join('|'));
}

/** Раздел по заголовку: текст подсказки, кнопки роутов, кнопка «ещё». */
function routeSection(ui: ReturnType<typeof within>, title: string) {
  const h = within(ui.getByTestId('db-table')).getAllByRole('heading', { level: 3 }).find((x) => x.textContent?.startsWith(title));
  const s = h?.parentElement;
  if (s === null || s === undefined) {
    throw new Error(`нет раздела ${title}`);
  }
  return {
    hint: s.querySelector('.drawer__hint')?.textContent ?? null,
    routes: s.querySelectorAll('[data-testid="db-route-link"]').length,
    docs: [...s.querySelectorAll('.db-view__route-doc')].map((d) => d.textContent),
    more: [...s.querySelectorAll('button')].find((b) => b.getAttribute('data-testid') !== 'db-route-link')?.textContent ?? null,
  };
}

describe('таблица с колонками и роутами', () => {
  test('колонки: имя в БД, признаки через точку, ссылки с on delete и без', () => {
    const ui = show('orders');
    expect(columns(ui)).toEqual([
      'id|uuid|PK · NOT NULL · = gen()|',
      'order_code|text|UNIQUE|',
      'status|text|одно из: new, paid|',
      'userId|uuid||→ users.id (on delete cascade)',
      'managerId|uuid||→ users.id',
    ]);
  });

  test('шапка: бейджи ORM и сервиса; длинное описание свёрнуто и раскрывается', () => {
    const ui = show('orders');
    const head = ui.getByTestId('db-table').querySelector('header');
    expect([...(head?.querySelectorAll('[data-slot="badge"]') ?? [])].map((b) => b.textContent)).toEqual(['drizzle', '@x/db']);
    const doc = ui.getByTestId('db-table').querySelector('.db-view__doc');
    expect(doc?.className).toBe('db-view__doc db-view__doc--clamp');
    fireEvent.click(ui.getByRole('button', { name: 'Показать полностью' }));
    expect(doc?.className).toBe('db-view__doc');
    expect(ui.getByRole('button', { name: 'Свернуть' })).toBeTruthy();
  });

  test('ровно восемь читающих — без «ещё»; пишущий роут с описанием', () => {
    const ui = show('orders');
    expect(routeSection(ui, 'Читают')).toEqual({ hint: null, routes: 8, docs: [], more: null });
    expect(routeSection(ui, 'Пишут')).toEqual({ hint: null, routes: 1, docs: ['Создаёт заказ.'], more: null });
  });

  test('описание ровно в предел — не свёрнуто; без сервиса — один бейдж; девять читающих — «Показать ещё 1»; писателей нет', () => {
    const ui = show('users');
    expect(ui.getByTestId('db-table').querySelector('.db-view__doc')?.className).toBe('db-view__doc');
    expect(ui.queryByRole('button', { name: 'Показать полностью' })).toBeNull();
    expect([...(ui.getByTestId('db-table').querySelectorAll('header [data-slot="badge"]'))].map((b) => b.textContent)).toEqual(['drizzle']);
    expect(routeSection(ui, 'Читают')).toEqual({ hint: null, routes: 8, docs: [], more: 'Показать ещё 1' });
    fireEvent.click(ui.getByRole('button', { name: 'Показать ещё 1' }));
    expect(routeSection(ui, 'Читают')).toEqual({ hint: null, routes: 9, docs: [], more: 'Свернуть' });
    expect(routeSection(ui, 'Пишут').hint).toBe('Ни один роут не пишет эту таблицу.');
  });

  test('таблица без роутов: подсказки чтения и записи', () => {
    const ui = show('logs');
    expect([routeSection(ui, 'Читают').hint, routeSection(ui, 'Пишут').hint]).toEqual(['Ни один роут не читает эту таблицу.', 'Ни один роут не пишет эту таблицу.']);
  });
});

test('без выбора открыта первая таблица списка и она отмечена; подсказка строки — описание или имя', () => {
  const ui = show(null);
  const rows = ui.getAllByRole('listitem').map((li) => li.querySelector('.db-view__row')).filter((b) => b !== null);
  const first = rows[0];
  expect(rows.map((b) => b.className.includes('db-view__row--on'))).toEqual(rows.map((_, i) => i === 0));
  expect(within(ui.getByTestId('db-table')).getByRole('heading', { level: 2 }).textContent).toBe(first?.querySelector('.db-view__name')?.textContent ?? 'нет строки');
  const titles = new Map(rows.map((b) => [b.querySelector('.db-view__name')?.textContent, b.getAttribute('title')]));
  expect([titles.get('logs'), titles.get('users')]).toEqual(['logs', 'у'.repeat(360)]);
});
