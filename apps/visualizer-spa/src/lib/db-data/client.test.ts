import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDbDataClient, DbDataError, rowsSearch } from './client';
import { DB_PAGE_SIZE } from './contract';

// Сервер по контракту — граница клиента (настоящий HTTP), не подмена тестируемого модуля.
const seen: { method: string; url: string; body: string }[] = [];
let server: Server;
let base = '';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c.toString()));
    req.on('end', () => resolve(s));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({ method: req.method ?? '', url: req.url ?? '', body });
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/__lam_db/status') {
      res.end(JSON.stringify({ state: 'ready', host: 'localhost', database: 'korbor', writable: true }));
    } else if (url.pathname === '/__lam_db/rows' && url.searchParams.get('table') === 'bad') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'нет таблицы bad' }));
    } else if (url.pathname === '/__lam_db/rows' && url.searchParams.get('table') === 'broken') {
      res.end(JSON.stringify({ table: 'broken' }));
    } else if (url.pathname === '/__lam_db/rows') {
      res.end(JSON.stringify({ table: 'users', columns: [{ name: 'id', type: 'int4', nullable: false, hasDefault: true }], primaryKey: ['id'], rows: [{ id: '1' }], total: 1, page: 0, size: 50 }));
    } else if (url.pathname === '/__lam_db/changes') {
      res.end(JSON.stringify({ inserted: 0, updated: 1, deleted: 0 }));
    } else {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain');
      res.end('упал');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr: AddressInfo | string | null = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('нет порта');
  }
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('клиент живых данных', () => {
  test('status и rows разбираются схемами, query собран по контракту', async () => {
    const c = createDbDataClient(base);
    expect(await c.status()).toEqual({ state: 'ready', host: 'localhost', database: 'korbor', writable: true });
    const page = await c.rows({ table: 'users', page: 2, size: DB_PAGE_SIZE, sort: 'id', dir: 'desc', filterColumn: 'name', filterValue: 'А б' });
    expect(page.rows).toEqual([{ id: '1' }]);
    expect(seen.at(-1)?.url).toBe('/__lam_db/rows?table=users&page=2&size=50&sort=id&dir=desc&filterColumn=name&filterValue=%D0%90+%D0%B1');
  });

  test('без сортировки и фильтра параметры не передаются', () => {
    expect(rowsSearch({ table: 't', page: 0, size: 50, dir: 'asc', filterColumn: 'x' })).toBe('table=t&page=0&size=50');
  });

  test('applyChanges шлёт POST с пакетом', async () => {
    const changes = { table: 'users', inserts: [], updates: [{ key: { id: '1' }, set: { name: 'А' } }], deletes: [] };
    expect(await createDbDataClient(base).applyChanges(changes)).toEqual({ inserted: 0, updated: 1, deleted: 0 });
    expect(seen.at(-1)).toEqual({ method: 'POST', url: '/__lam_db/changes', body: JSON.stringify(changes) });
  });

  test('ошибки: текст из DbError, не по контракту, не JSON, сервер не отвечает', async () => {
    const c = createDbDataClient(base);
    const bad = await c.rows({ table: 'bad', page: 0, size: 50 }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(DbDataError);
    expect(bad instanceof DbDataError && [bad.message, bad.status]).toEqual(['нет таблицы bad', 400]);
    await expect(c.rows({ table: 'broken', page: 0, size: 50 })).rejects.toThrow('не по контракту');
    await expect(createDbDataClient(`${base}/x`).status()).rejects.toThrow('сервер ответил 500: упал');
    await expect(createDbDataClient('http://127.0.0.1:1').status()).rejects.toThrow('не отвечает');
  });
});
