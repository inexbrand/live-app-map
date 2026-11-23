/**
 * Карточка роута, метод и отметки строки — на собранных вручную роутах:
 * каждый раздел карточки виден пользователю ровно в том виде, в каком описан.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import type { RouteCard } from '../lib/api-view-model';
import { resetStores } from '../test/fixtures';
import { Card, Marks, Method, usualChecks } from './ApiRouteCard';

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
const BARE: RouteCard = { route: ROUTE, reads: [], writes: [], callers: [], auto: { summary: 'Запись', lines: [], facts: 0 }, inputs: [] };

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
  inputs: [
    { part: 'params', label: 'Параметры пути', schema: { kind: 'typebox', fields: [], type: 'record<string, string>' } },
    {
      part: 'body',
      label: 'Тело',
      schema: { kind: 'zod', name: 'OrderBody', optional: true, fields: [{ name: 'items', type: 'object[]', rules: ['min 1'], fields: [{ name: 'sku', type: 'string', optional: true }] }] },
    },
  ],
};

function card(c: RouteCard) {
  const r = render(<Card card={c} />);
  return within(r.container);
}

/** Блоки раздела карточки под заголовком h3 через «|». */
function section(ui: ReturnType<typeof within>, title: string): string {
  const h = ui.getAllByRole('heading', { level: 3 }).find((x: HTMLElement) => x.textContent === title);
  return [...(h?.parentElement?.children ?? [])].slice(1).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).filter((s) => s !== '').join('|');
}

describe('карточка роута', () => {
  test('пустая карточка: подсказки во всех разделах, сервис — id, обработчик встроенный', () => {
    const ui = card(BARE);
    const head = ui.getByRole('banner');
    expect(head.querySelector('.api-card__meta')?.textContent).toBe('svc-api · elysiaapps/api/src/orders.ts:12');
    expect(ui.getByText(/Авторского описания нет/).textContent).toBe('Авторского описания нет — добавьте комментарий над обработчиком (apps/api/src/orders.ts:12).');
    expect(ui.queryAllByTestId('api-response')).toEqual([]);
    expect([section(ui, 'Вход'), section(ui, 'Доступ'), section(ui, 'Таблицы'), section(ui, 'Экраны'), section(ui, 'Обработчик')]).toEqual([
      'Схемы входа в коде не найдено.',
      'Проверок доступа в коде не найдено — роут открыт.',
      'Запросов в БД не найдено.',
      '',
      'встроенная функция · apps/api/src/orders.ts:14',
    ]);
  });

  test('полная карточка: сервис, описание с «Полностью», ответ, вход, доступ, таблицы, экраны', () => {
    const ui = card(FULL);
    expect(ui.getByRole('banner').querySelector('.api-card__meta')?.textContent).toBe('API · elysiaapps/api/src/orders.ts:12');
    expect(ui.getByText('Создаёт заказ.')).toBeTruthy();
    fireEvent.click(ui.getByRole('button', { name: 'Полностью' }));
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
    expect(ui.getByTestId('api-response').textContent).toBe('Ответ: { id }');
    expect(section(ui, 'Вход')).toBe('Параметры пути · TypeBoxrecord<string, string>|Тело · OrderBody · zod · необязательноitemsobject[] · min 1sku?string');
    expect(ui.getAllByTestId('api-input-field').map((tr) => `${tr.getAttribute('data-depth')}:${tr.querySelector('td')?.getAttribute('style')}`)).toEqual(['0:padding-left: 0px;', '1:padding-left: 14px;']);
    expect(section(ui, 'Доступ')).toBe('Нужен вход|Ролиadmin|Праваorders.write|ПроверкиrequireAdmin, requireOwner');
    expect(section(ui, 'Таблицы')).toBe('Читаетproducts · в цикле|Пишетorders_tbl');
    expect(ui.getAllByTestId('api-table-link').map((b) => `${b.textContent}|${b.getAttribute('title')}`)).toEqual(['products · в цикле|select ×2', 'orders_tbl|insert, update ×1']);
    expect(ui.getByTestId('api-screen-gap').textContent).toBe('Экраны карты не вызывают: вызов в недостижимом файле.a.ts, b.ts');
    expect(ui.getAllByTestId('api-screen-link').map((b) => `${b.textContent}|${b.getAttribute('title')}|${b.hasAttribute('disabled')}`)).toEqual(['Корзина|cart.tsx|false', 'Без ноды|x.tsx · через useOrders|true']);
    expect(section(ui, 'Обработчик')).toBe('createOrder · apps/api/src/h.ts:3');
  });

  test('описание из одного абзаца — без «Полностью»; разрыв без файлов — без строки файлов; доступ без входа', () => {
    const ui = card({ ...FULL, summary: 'Один абзац.', gap: { kind: 'no-caller', text: 'никто не вызывает', files: [] }, route: { ...FULL.route, access: { roles: ['x'] } } });
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
    expect(ui.getByTestId('api-screen-gap').querySelectorAll('p')).toHaveLength(1);
    expect(section(ui, 'Доступ')).toBe('Ролиx');
  });
});

test('метод: цвет по виду — чтение, удаление, запись', () => {
  const methods: readonly HttpMethod[] = ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT', 'PATCH', 'ALL'];
  const r = render(<>{methods.map((m) => <Method key={m} method={m} />)}</>);
  expect([...r.container.querySelectorAll('.api-method')].map((s) => s.className)).toEqual([
    'api-method api-method--read',
    'api-method api-method--read',
    'api-method api-method--read',
    'api-method api-method--delete',
    'api-method api-method--write',
    'api-method api-method--write',
    'api-method api-method--write',
    'api-method api-method--write',
  ]);
});

test('отметки строки: значок только у отличия от большинства', () => {
  const marks = (route: ApiRoute, usual = { input: false, access: false }) => {
    const r = render(<Marks route={route} usual={usual} />);
    const out = [...r.container.querySelectorAll('.api-mark')].map((m) => `${m.getAttribute('title')}|${m.querySelector('svg')?.getAttribute('aria-label') ?? ''}`);
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
