/**
 * Сетка данных против настоящего HTTP-сервера, отвечающего по контракту живых данных
 * (граница клиента; сам клиент и сетка — настоящие).
 */
import { useDom } from '../../test/dom';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDbDataClient, type DbDataClient } from '@/lib/db-data/client';
import type { DbChanges, DbLiveColumn, DbRow, DbStatus, RowsPage } from '@/lib/db-data/contract';
import { pickOption } from '../../test/select';
import { DataGrid } from './DataGrid';

useDom();

const columns: DbLiveColumn[] = [
  { name: 'id', type: 'int4', nullable: false, hasDefault: true },
  { name: 'name', type: 'text', nullable: false, hasDefault: false },
  { name: 'active', type: 'bool', nullable: true, hasDefault: false },
  { name: 'meta', type: 'jsonb', nullable: true, hasDefault: false },
];
const users: DbRow[] = [
  { id: '1', name: 'Анна', active: 'true', meta: null },
  { id: '2', name: 'Борис', active: null, meta: '{"a": 1}' },
  { id: '3', name: 'x'.repeat(200), active: 'false', meta: null },
];

let status: DbStatus = { state: 'ready', host: 'localhost', database: 'test', writable: true };
let changesReply: { code: number; body: unknown } = { code: 200, body: { inserted: 0, updated: 0, deleted: 0 } };
const posted: DbChanges[] = [];
const rowQueries: URLSearchParams[] = [];
let server: Server;
let client: DbDataClient;

function page(table: string, q: URLSearchParams): RowsPage {
  if (table === 'logs') {
    return { table, columns: [{ name: 'msg', type: 'text', nullable: true, hasDefault: false }], primaryKey: [], rows: [{ msg: 'привет' }], total: 1, page: 0, size: 50 };
  }
  return { table, columns, primaryKey: ['id'], rows: users, total: 120, page: Number(q.get('page')), size: 50 };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname.endsWith('/status')) {
        res.end(JSON.stringify(status));
      } else if (url.pathname.endsWith('/rows')) {
        rowQueries.push(url.searchParams);
        res.end(JSON.stringify(page(url.searchParams.get('table') ?? '', url.searchParams)));
      } else {
        posted.push(JSON.parse(body));
        res.statusCode = changesReply.code;
        res.end(JSON.stringify(changesReply.body));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr: AddressInfo | string | null = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('нет порта');
  }
  client = createDbDataClient(`http://127.0.0.1:${addr.port}`);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  status = { state: 'ready', host: 'localhost', database: 'test', writable: true };
  changesReply = { code: 200, body: { inserted: 0, updated: 0, deleted: 0 } };
  posted.length = 0;
  rowQueries.length = 0;
});

async function grid(table = 'users') {
  const r = render(<DataGrid table={table} client={client} />);
  const ui = within(r.container);
  await ui.findByText(table === 'users' ? 'строки 1–50 из 120' : 'строки 1–1 из 1');
  return { ui, container: r.container, user: userEvent.setup({ document }) };
}

function cell(container: HTMLElement, rowId: string, column: string): HTMLElement {
  const row = Array.from(container.querySelectorAll('tr.dg-row')).find((tr) => tr.getAttribute('data-row-id') === rowId);
  const td = row?.querySelector(`td[data-column="${column}"]`);
  if (!(td instanceof HTMLElement)) {
    throw new Error(`нет ячейки ${rowId}/${column}`);
  }
  return td;
}

describe('сетка данных', () => {
  test('шапка с типами, NULL приглушённо, длинный текст с title; клик по шапке сортирует', async () => {
    const { ui, container, user } = await grid();
    expect(ui.getByText('users')).toBeTruthy();
    expect(ui.getByText('120 строк')).toBeTruthy();
    expect(container.querySelector('th .dg-head__type')?.textContent).toBe('int4');
    expect(cell(container, '["2"]', 'active').querySelector('.dg-null')?.textContent).toBe('NULL');
    expect(cell(container, '["3"]', 'name').querySelector('.dg-value')?.getAttribute('title')).toBe('x'.repeat(200));
    await user.click(ui.getByTitle('Сортировать по name'));
    await waitFor(() => expect(rowQueries.at(-1)?.get('sort')).toBe('name'));
    expect(rowQueries.at(-1)?.get('dir')).toBe('asc');
    await user.click(ui.getByTitle('Сортировать по name'));
    await waitFor(() => expect(rowQueries.at(-1)?.get('dir')).toBe('desc'));
    expect(container.querySelector('th[aria-sort="descending"]')?.textContent).toContain('name');
  });

  test('правка ячейки подсвечена, «Сохранить» шлёт пакет, успех сбрасывает правки и перечитывает', async () => {
    const { ui, container, user } = await grid();
    expect(ui.queryByText(/Сохранить изменения/)).toBeNull();
    fireEvent.doubleClick(cell(container, '["1"]', 'name'));
    const input = ui.getByLabelText('Значение name');
    await user.clear(input);
    await user.type(input, 'Аня{Enter}');
    expect(cell(container, '["1"]', 'name').className).toContain('dg-cell--changed');
    expect(cell(container, '["1"]', 'name').textContent).toBe('Аня');
    fireEvent.doubleClick(cell(container, '["2"]', 'active'));
    await pickOption(ui.getByLabelText('Значение active'), 'false');
    changesReply = { code: 200, body: { inserted: 0, updated: 2, deleted: 0 } };
    const before = rowQueries.length;
    await user.click(ui.getByText('Сохранить изменения (2)'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      table: 'users',
      inserts: [],
      updates: [
        { key: { id: '1' }, set: { name: 'Аня' } },
        { key: { id: '2' }, set: { active: 'false' } },
      ],
      deletes: [],
    });
    await ui.findByText('Сохранено: добавлено 0, изменено 2, удалено 0');
    expect(rowQueries.length).toBe(before + 1);
    expect(ui.queryByText(/Сохранить изменения/)).toBeNull();
  });

  test('ошибка сохранения видна сверху, правки остаются; Esc отменяет редактор; неверный JSON не применяется', async () => {
    const { ui, container, user } = await grid();
    fireEvent.doubleClick(cell(container, '["2"]', 'meta'));
    const area = ui.getByLabelText('Значение meta');
    await user.clear(area);
    await user.type(area, '{{не json{Enter}');
    expect(ui.getByText(/неверный JSON/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(ui.queryByLabelText('Значение meta')).toBeNull();
    expect(cell(container, '["2"]', 'meta').className).not.toContain('dg-cell--changed');
    fireEvent.doubleClick(cell(container, '["1"]', 'active'));
    await user.click(within(ui.getByRole('dialog', { name: 'Правка active' })).getByText('NULL'));
    changesReply = { code: 409, body: { error: 'нарушено ограничение users_active_check' } };
    await user.click(ui.getByText('Сохранить изменения (1)'));
    await ui.findByText('нарушено ограничение users_active_check');
    expect(posted[0]?.updates).toEqual([{ key: { id: '1' }, set: { active: null } }]);
    expect(ui.getByText('Сохранить изменения (1)')).toBeTruthy();
  });

  test('новая строка с пустым обязательным полем: ошибка под ячейкой, запрос не уходит', async () => {
    const { ui, container, user } = await grid();
    await user.click(ui.getByText('Добавить строку'));
    const newRow = container.querySelector('tr.dg-row--new');
    const id = newRow?.getAttribute('data-row-id') ?? '';
    expect(container.querySelector('tbody tr')).toBe(newRow);
    expect(cell(container, id, 'name').textContent).toBe('обязательно');
    expect(cell(container, id, 'id').textContent).toBe('DEFAULT');
    await user.click(ui.getByText('Сохранить изменения (1)'));
    expect(cell(container, id, 'name').textContent).toContain('заполните name');
    expect(ui.getByRole('alert').textContent).toContain('name');
    expect(posted).toHaveLength(0);
    fireEvent.doubleClick(cell(container, id, 'name'));
    await user.type(ui.getByLabelText('Значение name'), 'Вера{Enter}');
    expect(cell(container, id, 'name').textContent).toBe('Вера');
    await user.click(ui.getByText('Сохранить изменения (1)'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ table: 'users', inserts: [{ name: 'Вера' }], updates: [], deletes: [] });
  });

  test('удаление выбранных: строки зачёркнуты, в пакете ключи; «Отменить» сбрасывает', async () => {
    const { ui, container, user } = await grid();
    await user.click(within(cell(container, '["1"]', 'id').parentElement ?? container).getByLabelText('Выбрать строку'));
    await user.click(within(cell(container, '["3"]', 'id').parentElement ?? container).getByLabelText('Выбрать строку'));
    await user.click(ui.getByText('Удалить выбранные (2)'));
    expect(container.querySelectorAll('tr.dg-row--deleted')).toHaveLength(2);
    await user.click(ui.getByText('Отменить'));
    expect(container.querySelectorAll('tr.dg-row--deleted')).toHaveLength(0);
    await user.click(ui.getByLabelText('Выбрать все строки'));
    await user.click(ui.getByText('Удалить выбранные (3)'));
    await user.click(within(container.querySelector('tr[data-row-id=\'["2"]\']') ?? container).getByText('вернуть'));
    await user.click(ui.getByText('Сохранить изменения (2)'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ table: 'users', inserts: [], updates: [], deletes: [{ id: '1' }, { id: '3' }] });
  });

  test('переход по страницам с правками спрашивает подтверждение', async () => {
    const { ui, container, user } = await grid();
    fireEvent.doubleClick(cell(container, '["1"]', 'name'));
    await user.type(ui.getByLabelText('Значение name'), '!{Enter}');
    const asked: string[] = [];
    const answer = { ok: false };
    const original = window.confirm;
    window.confirm = (text?: string): boolean => {
      asked.push(text ?? '');
      return answer.ok;
    };
    try {
    await user.click(ui.getByText('Вперёд'));
    expect(asked).toEqual(['Несохранённых правок: 1. Отбросить их?']);
    expect(ui.getByText('строки 1–50 из 120')).toBeTruthy();
    answer.ok = true;
    await user.click(ui.getByText('Вперёд'));
    await ui.findByText('строки 51–100 из 120');
    expect(rowQueries.at(-1)?.get('page')).toBe('1');
    expect(ui.queryByText(/Сохранить изменения/)).toBeNull();
    } finally {
      window.confirm = original;
    }
  });

  test('фильтр «колонка = значение» уходит в запрос; без колонки — подсказка', async () => {
    const { ui, user } = await grid();
    await user.click(ui.getByText('Найти'));
    expect(ui.getByText('выберите колонку фильтра')).toBeTruthy();
    await pickOption(ui.getByLabelText('Колонка фильтра'), 'name');
    await user.type(ui.getByLabelText('Значение фильтра'), 'Анна{Enter}');
    await waitFor(() => expect(rowQueries.at(-1)?.get('filterValue')).toBe('Анна'));
    expect(rowQueries.at(-1)?.get('filterColumn')).toBe('name');
  });

  test('таблица без PK — только чтение: нет выбора, добавления и редактора', async () => {
    const { ui, container } = await grid('logs');
    expect(ui.getByText(/Только чтение: у таблицы нет первичного ключа/)).toBeTruthy();
    expect(ui.queryByText('Добавить строку')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    fireEvent.doubleClick(cell(container, 'row:0', 'msg'));
    expect(ui.queryByRole('dialog')).toBeNull();
  });

  test('нелокальная БД — только чтение с причиной сервера', async () => {
    status = { state: 'ready', host: 'db.example.com', database: 'prod', writable: false, readOnlyReason: 'хост db.example.com не локальный' };
    const { ui } = await grid();
    expect(ui.getByText('Только чтение: хост db.example.com не локальный')).toBeTruthy();
    expect(ui.queryByText('Добавить строку')).toBeNull();
  });

  test('статус off — причина и что вписать в config.ts; error — текст ошибки', async () => {
    status = { state: 'off', reason: 'В .live-app-map/config.ts нет поля database', hint: "database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' }" };
    const off = render(<DataGrid table="users" client={client} />);
    await within(off.container).findByText('В .live-app-map/config.ts нет поля database');
    expect(off.container.querySelector('.dg-hint')?.textContent).toContain("urlEnv: 'DATABASE_URL'");
    off.unmount();
    status = { state: 'error', message: 'connect ECONNREFUSED 127.0.0.1:16432' };
    const err = render(<DataGrid table="users" client={client} />);
    expect((await within(err.container).findByRole('alert')).textContent).toContain('ECONNREFUSED');
  });
});
