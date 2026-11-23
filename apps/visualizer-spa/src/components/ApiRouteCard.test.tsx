/**
 * Доска роута, метод и отметки строки — на собранных вручную роутах:
 * каждый блок доски виден пользователю ровно в том виде, в каком описан.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import type { RouteCard } from '../lib/api-view-model';
import { resetStores } from '../test/fixtures';
import { Marks, Method, RouteBoard, usualChecks } from './ApiRouteCard';

useDom();

beforeEach(resetStores);

const ROUTE: ApiRoute = {
  id: 'r1',
  framework: 'elysia',
  method: 'POST',
  path: '/orders/:id',
  serviceId: 'svc-api',
  location: { file: 'apps/api/src/orders.ts', line: 12 },
  handler: { location: { file: 'apps/api/src/orders.ts', line: 14 } },
  dbCalls: [],
};

/** Карточка: пустые разделы, без сервиса и описания. */
const BARE: RouteCard = {
  route: ROUTE,
  reads: [],
  writes: [],
  callers: [],
  auto: { summary: 'Запись', lines: [], facts: 0 },
  inputs: [],
  domain: 'orders',
  pathParams: ['id'],
  effects: [],
  tables: [],
};

const ORDERS_COLUMNS = [
  { name: 'id', type: 'uuid', primaryKey: true, notNull: true },
  { name: 'userId', sqlName: 'user_id', type: 'uuid', notNull: true, references: { table: 'users', column: 'id' } },
  { name: 'status', type: 'text', default: "'draft'" },
];

/** Карточка, где заполнено всё. */
const FULL: RouteCard = {
  route: { ...ROUTE, handler: { name: 'createOrder', location: { file: 'apps/api/src/h.ts', line: 3 } }, access: { auth: true, roles: ['admin'], permissions: ['orders.write'], checks: ['requireAdmin', 'requireOwner'] } },
  service: { id: 'svc-api', name: 'API', root: 'apps/api' },
  summary: 'Создаёт заказ.\n\nПодробно: проверяет склад.',
  auto: { summary: 'Запись в orders', lines: [{ label: 'Таблицы', text: 'orders' }, { label: 'Ответ', text: '{ id }' }], facts: 3 },
  gap: { kind: 'unreached', text: 'вызов в недостижимом файле', files: ['a.ts', 'b.ts'] },
  callers: [
    { nodeId: 'n1', title: 'Корзина', file: 'cart.tsx' },
    { title: 'Без ноды', file: 'x.tsx', via: 'useOrders' },
  ],
  reads: [{ table: 'products', operations: ['select'], count: 2, inLoop: true }],
  writes: [{ table: 'orders', dbName: 'orders_tbl', operations: ['insert', 'update'], count: 1, inLoop: false }],
  domain: 'orders',
  pathParams: [],
  effects: [
    { label: 'Добавляет строки', tables: ['orders_tbl'] },
    { label: 'Обновляет', tables: ['orders_tbl'] },
  ],
  tables: [
    { touch: { table: 'products', operations: ['select'], count: 2, inLoop: true }, mode: 'read', columns: [] },
    { touch: { table: 'orders', dbName: 'orders_tbl', operations: ['insert', 'update'], count: 1, inLoop: false }, mode: 'write', columns: ORDERS_COLUMNS },
  ],
  inputs: [
    { part: 'params', label: 'Параметры пути', schema: { kind: 'typebox', fields: [], type: 'record<string, string>' } },
    {
      part: 'body',
      label: 'Тело',
      schema: { kind: 'zod', name: 'OrderBody', optional: true, fields: [{ name: 'items', type: 'object[]', rules: ['min 1'], fields: [{ name: 'sku', type: 'string', optional: true }] }] },
    },
  ],
};

function board(c: RouteCard) {
  const r = render(<RouteBoard card={c} />);
  return within(r.container);
}

/** Текст блока доски по заголовку: строки содержимого через «|». */
function block(ui: ReturnType<typeof within>, title: string): string {
  const head = ui.getAllByText(title).find((x: HTMLElement) => x.getAttribute('data-slot') === 'card-title');
  const content = head?.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]');
  return [...(content?.children ?? [])].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).filter((s) => s !== '').join('|');
}

describe('доска роута', () => {
  test('пустая доска: домен, параметры пути из пути, подсказки во всех блоках', () => {
    const ui = board(BARE);
    expect(ui.getByRole('banner').textContent).toBe('POST/orders/:idorderssvc-api · elysiaapps/api/src/orders.ts:12');
    expect(ui.getByText(/Авторского описания нет/).textContent).toBe('Авторского описания нет — добавьте комментарий над обработчиком (apps/api/src/orders.ts:12).');
    expect([block(ui, 'Принимает'), block(ui, 'Отдаёт'), block(ui, 'Доступ'), block(ui, 'База данных'), block(ui, 'Экраны'), block(ui, 'Код')]).toEqual([
      'Параметры пути без схемы:id|Схемы входа в коде не найдено.',
      'Ответ в коде не найден.',
      'Проверок доступа в коде не найдено — роут открыт.',
      'Запросов в БД не найдено.',
      '',
      'Обработчиквстроенная функция|apps/api/src/orders.ts:14',
    ]);
  });

  test('полная доска: описание с «Полностью», вход, ответ, доступ, что меняет, таблицы с колонками, экраны', () => {
    const ui = board({ ...FULL, route: { ...FULL.route, response: { fields: ['id', 'status'], statuses: [201, 409] } } });
    expect(ui.getByText('Создаёт заказ.')).toBeTruthy();
    fireEvent.click(ui.getByRole('button', { name: 'Полностью' }));
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
    expect(block(ui, 'Принимает')).toBe('Параметры пути · TypeBoxrecord<string, string>|Тело · OrderBody · zod · необязательноПолеТипОбязательноПравилаitemsobject[]даmin 1skustringнет');
    expect(ui.getAllByTestId('api-input-field').map((tr) => `${tr.getAttribute('data-depth')}:${tr.querySelector('td')?.getAttribute('style')}`)).toEqual(['0:padding-left: 8px;', '1:padding-left: 22px;']);
    expect(block(ui, 'Отдаёт')).toBe('Поляidstatus|Статусы201409');
    expect(block(ui, 'Доступ')).toBe('Нужен вход|Ролиadmin|Праваorders.write|ПроверкиrequireAdminrequireOwner');
    expect(ui.getByTestId('api-effects').textContent).toBe('Добавляет строки:orders_tblОбновляет:orders_tbl');
    expect(ui.getAllByTestId('api-db-table').map((x) => `${x.getAttribute('data-mode')}|${(x.textContent ?? '').trim()}`)).toEqual([
      'read|productsчитаетselect×2в цикленет в схеме',
      'write|orders_tblпишетinsertupdate×1',
    ]);
    expect(ui.getAllByTestId('api-table-link').map((b) => b.textContent)).toEqual(['products', 'orders_tbl']);
    expect(ui.getByRole('button', { name: 'Колонки products' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(ui.getByRole('button', { name: 'Колонки orders_tbl' }));
    expect(ui.getAllByTestId('api-db-column').map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent).join('|'))).toEqual([
      'id|uuid|ключ, not null',
      'user_id|uuid|not null, → users.id',
      "status|text|по умолчанию 'draft'",
    ]);
    expect(ui.getByTestId('api-screen-gap').textContent).toBe('Экраны карты не вызывают: вызов в недостижимом файле.a.ts, b.ts');
    expect(ui.getAllByTestId('api-screen-link').map((b) => `${b.textContent}|${b.getAttribute('title')}|${b.hasAttribute('disabled')}`)).toEqual(['Корзина|cart.tsx|false', 'Без ноды|x.tsx · через useOrders|true']);
    expect(block(ui, 'Код')).toBe('ОбработчикcreateOrder|apps/api/src/h.ts:3');
  });

  test('описание из одного абзаца — без «Полностью»; разрыв без файлов — без строки файлов; доступ без входа; только чтение', () => {
    const ui = board({ ...FULL, summary: 'Один абзац.', gap: { kind: 'no-caller', text: 'никто не вызывает', files: [] }, route: { ...FULL.route, access: { roles: ['x'] } }, effects: [] });
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
    expect(ui.getByTestId('api-screen-gap').querySelectorAll('p')).toHaveLength(1);
    expect(block(ui, 'Доступ')).toBe('Ролиx');
    expect(ui.getByText('Только читает — данных не меняет.')).toBeTruthy();
  });
});

test('метод: цвет по виду — чтение, удаление, запись', () => {
  const methods: readonly HttpMethod[] = ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT', 'PATCH', 'ALL'];
  const r = render(<>{methods.map((m) => <Method key={m} method={m} />)}</>);
  expect([...r.container.querySelectorAll('[data-kind]')].map((s) => `${s.textContent}:${s.getAttribute('data-kind')}`)).toEqual([
    'GET:read',
    'HEAD:read',
    'OPTIONS:read',
    'DELETE:delete',
    'POST:write',
    'PUT:write',
    'PATCH:write',
    'ALL:write',
  ]);
});

test('отметки строки: значок только у отличия от большинства', () => {
  const marks = (route: ApiRoute, usual = { input: false, access: false }) => {
    const r = render(<Marks route={route} usual={usual} />);
    const out = [...r.container.querySelectorAll('[data-testid="api-mark"]')].map((m) => `${m.getAttribute('title')}|${m.querySelector('svg')?.getAttribute('aria-label') ?? ''}`);
    r.unmount();
    return out;
  };
  expect(marks(ROUTE)).toEqual(['Схемы входа нет|', 'Проверок доступа в коде нет|']);
  const checked: ApiRoute = { ...ROUTE, input: { body: { kind: 'zod', fields: [] } }, access: {} };
  expect(marks(checked)).toEqual(['Есть проверка входа (схема)|вход проверяется', 'Есть проверка доступа|доступ проверяется']);
  const allChecked = { input: true, access: true };
  expect(marks(checked, allChecked)).toEqual(['Есть проверка входа (схема)|', 'Есть проверка доступа|']);
  expect(marks(ROUTE, allChecked)).toEqual(['Схемы входа нет|вход не проверяется', 'Проверок доступа в коде нет|доступ не проверяется']);
});

test('обычное для карты — признак у половины роутов и больше', () => {
  const withInput: ApiRoute = { ...ROUTE, input: { body: { kind: 'zod', fields: [] } } };
  expect(usualChecks([withInput, ROUTE])).toEqual({ input: true, access: false });
  expect(usualChecks([withInput, ROUTE, ROUTE])).toEqual({ input: false, access: false });
});
