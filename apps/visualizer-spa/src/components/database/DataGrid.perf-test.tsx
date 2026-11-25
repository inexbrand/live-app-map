/**
 * Reassure: сетка данных 50 строк × 30 колонок — загрузка страницы и правка одной ячейки.
 * Данные отдаёт настоящий HTTP-сервер по контракту. Запуск — `bun run test:perf`.
 */
import { useDom } from '../../test/dom';
import { afterAll, beforeAll, expect } from 'bun:test';
import { fireEvent, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDbDataClient, type DbDataClient } from '@/lib/db-data/client';
import type { DbLiveColumn, DbRow, RowsPage } from '@/lib/db-data/contract';
import { perfTest } from '../../perf/perf-test';
import { DataGrid } from './DataGrid';

useDom();

const columns: DbLiveColumn[] = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, type: i === 0 ? 'int4' : 'text', nullable: i > 1, hasDefault: i === 0 }));
const rows: DbRow[] = Array.from({ length: 50 }, (_, r) => Object.fromEntries(columns.map((c, i) => [c.name, i === 0 ? String(r + 1) : i % 7 === 0 ? null : `значение ${r}-${i}`])));
const body: RowsPage = { table: 'wide', columns, primaryKey: ['c0'], rows, total: 1000, page: 0, size: 50 };

let server: Server;
const holder: { client: DbDataClient | null } = { client: null };

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url?.includes('/status') === true ? { state: 'ready', host: 'localhost', database: 't', writable: true } : body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr: AddressInfo | string | null = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('нет порта');
  }
  holder.client = createDbDataClient(`http://127.0.0.1:${addr.port}`);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function client(): DbDataClient {
  if (holder.client === null) {
    throw new Error('сервер не поднят');
  }
  return holder.client;
}

perfTest(
  'сетка данных: 50×30, правка ячейки',
  () => <DataGrid table="wide" client={client()} />,
  {
    runs: 5,
    scenario: async (view: RenderResult) => {
      const ui = within(view.container);
      await ui.findByText('строки 1–50 из 1000');
      const td = view.container.querySelector('tr[data-row-id=\'["5"]\'] td[data-column="c3"]');
      if (!(td instanceof HTMLElement)) {
        throw new Error('нет ячейки');
      }
      fireEvent.doubleClick(td);
      await userEvent.setup({ document }).type(ui.getByLabelText('Значение c3'), '!{Enter}');
      await waitFor(() => expect(td.className).toContain('dg-cell--changed'));
    },
  },
  (stats) => {
    expect(stats.meanCount).toBeGreaterThan(1);
    expect(stats.issues.redundantUpdates).toEqual([]);
    console.info(`DataGrid 50×30: рендеров ${stats.meanCount}, среднее ${stats.meanDuration.toFixed(1)} мс`);
  },
);
