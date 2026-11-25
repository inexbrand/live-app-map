/**
 * Живые данные БД против настоящего Postgres (гейт LAM_TEST_DATABASE_URL): middleware через
 * настоящий HTTP-сервер, проект во временном каталоге с настоящим config.ts.
 *
 * Работает только в схеме-песочнице lam_test_<случайное>, созданной тестом; в afterAll она
 * удаляется целиком — чужие данные базы не трогаются.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { serveMiddleware, type TestServer } from '../dev-http.test-helpers';
import type { OpenProject } from '../project/project-server';
import { changesResultSchema, dbStatusSchema, rowsPageSchema, type DbChanges } from './contract';
import { createDbDataMiddleware } from './db-middleware';
import { closeDbPool } from './db-ops';

const DB_URL = process.env['LAM_TEST_DATABASE_URL'] ?? '';
const tag = `lam_test_${Math.random().toString(36).slice(2, 10)}`;
const T = { items: `${tag}_items`, nopk: `${tag}_nopk`, pair: `${tag}_pair` };
const tmp = mkdtempSync(path.join(tmpdir(), 'lam-db-live-'));

/** Проект с config.ts: database из переменной urlEnv, адрес — в env middleware. */
function makeProject(name: string): OpenProject {
  const root = path.join(tmp, name);
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  mkdirSync(path.join(root, '.live-app-map'), { recursive: true });
  writeFileSync(
    path.join(root, '.live-app-map/config.ts'),
    `export const config = { name: '${name}', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:5173' }], database: { urlEnv: 'LAM_DB', envFile: 'db.env' } };\n`,
  );
  return { root, name, mapFile: path.join(root, '.live-app-map/map.json'), statesFile: path.join(root, '.live-app-map/states.ts') };
}

describe.skipIf(DB_URL === '')('живая БД (LAM_TEST_DATABASE_URL)', () => {
  const admin = postgres(DB_URL, { max: 1, onnotice: () => undefined });
  let local: TestServer;
  let remote: TestServer;

  beforeAll(async () => {
    await admin.unsafe(`
      CREATE SCHEMA ${tag};
      CREATE TYPE ${tag}.kind AS ENUM ('a', 'b');
      CREATE TABLE ${tag}.${T.items} (id serial PRIMARY KEY, name text NOT NULL, qty int4 NOT NULL DEFAULT 0, kind ${tag}.kind, data jsonb, code varchar(3) UNIQUE, flag bool, at timestamptz);
      CREATE TABLE ${tag}.${T.nopk} (a text);
      CREATE TABLE ${tag}.${T.pair} (a int4, b text, note text, PRIMARY KEY (a, b));
      INSERT INTO ${tag}.${T.items} (name, qty, kind, data, code) SELECT 'n' || g, g % 3, (CASE WHEN g % 2 = 0 THEN 'a' ELSE 'b' END)::${tag}.kind, jsonb_build_object('g', g), 'c' || g FROM generate_series(1, 12) g;
      INSERT INTO ${tag}.${T.nopk} VALUES ('x');
      INSERT INTO ${tag}.${T.pair} VALUES (1, 'x', 'one'), (1, 'y', 'two');
    `).simple();
    const project = makeProject('live');
    // Адрес — из файла env проекта (окружение пустое): та же дорога, что у korbor.
    writeFileSync(path.join(project.root, 'db.env'), `LAM_DB=${DB_URL}\n`);
    local = await serveMiddleware(createDbDataMiddleware({ project, env: {} }));
    remote = await serveMiddleware(createDbDataMiddleware({ project, env: { LAM_DB: 'postgres://u:p@db.example.com:5432/prod' } }));
  });

  afterAll(async () => {
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${tag} CASCADE`);
    await admin.end();
    await closeDbPool();
    await Promise.all([local.close(), remote.close()]);
    rmSync(tmp, { recursive: true, force: true });
  });

  async function rows(query: string): Promise<{ readonly status: number; readonly body: unknown }> {
    const res = await fetch(`${local.url}/__lam_db/rows?${query}`);
    return { status: res.status, body: await res.json() };
  }

  async function post(server: TestServer, body: unknown): Promise<{ readonly status: number; readonly body: unknown }> {
    const res = await fetch(`${server.url}/__lam_db/changes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }

  function changes(table: string, part: Partial<DbChanges>): DbChanges {
    return { table, inserts: [], updates: [], deletes: [], ...part };
  }

  test('status: ready, локальный хост — запись разрешена', async () => {
    const status = dbStatusSchema.parse(await (await fetch(`${local.url}/__lam_db/status`)).json());
    expect(status).toMatchObject({ state: 'ready', writable: true });
  });

  test('страница: колонки из каталога, enum, ключ, текст значений, сортировка, фильтр, total', async () => {
    const first = rowsPageSchema.parse((await rows(`table=${T.items}&page=0&size=5&sort=qty&dir=desc`)).body);
    expect(first.columns.map((c) => [c.name, c.type, c.nullable, c.hasDefault])).toEqual([
      ['id', 'int4', false, true], ['name', 'text', false, false], ['qty', 'int4', false, true], ['kind', 'kind', true, false], ['data', 'jsonb', true, false], ['code', 'varchar', true, false], ['flag', 'bool', true, false], ['at', 'timestamptz', true, false],
    ]);
    expect(first.columns.find((c) => c.name === 'kind')?.enumValues).toEqual(['a', 'b']);
    expect(first.primaryKey).toEqual(['id']);
    expect(first.total).toBe(12);
    // qty = 2 у g = 2, 5, 8, 11; при равном qty порядок по id.
    expect(first.rows.map((r) => [r['id'], r['qty']])).toEqual([['2', '2'], ['5', '2'], ['8', '2'], ['11', '2'], ['1', '1']]);
    expect(first.rows[0]?.['data']).toBe('{"g": 2}');
    const second = rowsPageSchema.parse((await rows(`table=${T.items}&page=2&size=5`)).body);
    expect(second.rows.map((r) => r['id'])).toEqual(['11', '12']);
    const filtered = rowsPageSchema.parse((await rows(`table=${T.items}&page=0&size=50&filterColumn=kind&filterValue=a`)).body);
    expect([filtered.total, filtered.rows.length]).toEqual([6, 6]);
  });

  test('отказы чтения: неизвестная колонка, нет таблицы, неверный запрос', async () => {
    expect(await rows(`table=${T.items}&page=0&size=5&sort=nope`)).toEqual({ status: 400, body: { ok: false, error: `нет колонки nope в таблице ${T.items}` } });
    expect((await rows(`table=${tag}_none&page=0&size=5`)).status).toBe(404);
    expect((await rows(`table=${T.items}&page=-1&size=5`)).status).toBe(400);
  });

  test('пакет: удаление, правка (текст → int/enum/jsonb), вставка и вставка из одних DEFAULT — одной транзакцией', async () => {
    const res = await post(local, changes(T.items, {
      deletes: [{ id: '1' }, { id: '2' }],
      updates: [{ key: { id: '3' }, set: { qty: '42', kind: 'a', data: '{"x": [1]}', flag: 'true', at: '2026-11-25 10:00:00+03' } }, { key: { id: '4' }, set: { data: null } }],
      inserts: [{ name: 'новый', code: 'new' }],
    }));
    expect(res.status).toBe(200);
    expect(changesResultSchema.parse(res.body)).toEqual({ inserted: 1, updated: 2, deleted: 2 });
    const got = await admin.unsafe(`SELECT id, qty, kind::text AS kind, jsonb_typeof(data) || ' ' || data::text AS data, code, flag, at = '2026-11-25T07:00:00Z'::timestamptz AS at_ok FROM ${tag}.${T.items} WHERE id IN (1, 2, 3, 4) OR code = 'new' ORDER BY id`);
    expect(got.map((r) => [r['id'], r['qty'], r['kind'], r['data'], r['code'], r['flag'], r['at_ok']])).toEqual([
      [3, 42, 'a', 'object {"x": [1]}', 'c3', true, true],
      [4, 1, 'a', null, 'c4', null, null],
      [13, 0, null, null, 'new', null, null],
    ]);
  });

  test('ошибка в середине пакета — откат всего: удаление и правка до неё не применились', async () => {
    const res = await post(local, changes(T.items, {
      deletes: [{ id: '5' }],
      updates: [{ key: { id: '6' }, set: { qty: '7' } }],
      inserts: [{ name: 'дубль', code: 'c7' }],
    }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('Postgres: duplicate key value');
    const got = await admin.unsafe(`SELECT id, qty FROM ${tag}.${T.items} WHERE id IN (5, 6) ORDER BY id`);
    expect(got.map((r) => [r['id'], r['qty']])).toEqual([[5, 2], [6, 0]]);
  });

  test('строки нет (удалили параллельно) — 409 и откат; неверный текст для типа — 400 от Postgres', async () => {
    const gone = await post(local, changes(T.items, { updates: [{ key: { id: '7' }, set: { qty: '9' } }], deletes: [{ id: '999' }] }));
    expect(gone.status).toBe(409);
    expect(JSON.stringify(gone.body)).toContain('удаление: ожидалось строк 1, затронуто 0');
    expect((await admin.unsafe(`SELECT qty FROM ${tag}.${T.items} WHERE id = 7`))[0]?.['qty']).toBe(1);
    const badType = await post(local, changes(T.items, { updates: [{ key: { id: '7' }, set: { qty: 'много' } }] }));
    expect(badType.status).toBe(400);
    const tooLong = await post(local, changes(T.items, { updates: [{ key: { id: '7' }, set: { code: 'abcd' } }] }));
    expect([tooLong.status, JSON.stringify(tooLong.body).includes('too long')]).toEqual([400, true]);
  });

  test('составной ключ: правка и удаление по паре колонок', async () => {
    const res = await post(local, changes(T.pair, { updates: [{ key: { a: '1', b: 'x' }, set: { note: 'правка' } }], deletes: [{ a: '1', b: 'y' }] }));
    expect(res).toEqual({ status: 200, body: { inserted: 0, updated: 1, deleted: 1 } });
    const got = await admin.unsafe(`SELECT a, b, note FROM ${tag}.${T.pair}`);
    expect(got.map((r) => [r['a'], r['b'], r['note']])).toEqual([[1, 'x', 'правка']]);
  });

  test('отказы записи: без PK — 400, неизвестная колонка — 400, тело не по схеме — 400, нелокальный хост — 403', async () => {
    expect(await post(local, changes(T.nopk, { inserts: [{ a: 'y' }] }))).toEqual({ status: 400, body: { ok: false, error: `у таблицы ${T.nopk} нет первичного ключа — только чтение` } });
    expect(await post(local, changes(T.items, { inserts: [{ nope: '1' }] }))).toEqual({ status: 400, body: { ok: false, error: `нет колонки nope в таблице ${T.items}` } });
    const notSchema = await post(local, { table: T.items, inserts: 'все' });
    expect(notSchema.status).toBe(400);
    const far = await post(remote, changes(T.items, { deletes: [{ id: '8' }] }));
    expect(far).toEqual({ status: 403, body: { ok: false, error: 'запись запрещена: хост БД db.example.com не локальный — запись разрешена только для localhost, 127.0.0.1, ::1' } });
    expect((await admin.unsafe(`SELECT count(*)::int AS n FROM ${tag}.${T.nopk}`))[0]?.['n']).toBe(1);
  });

  test('метод не тот — 405; чужой origin — 403', async () => {
    expect((await fetch(`${local.url}/__lam_db/changes`)).status).toBe(405);
    expect((await fetch(`${local.url}/__lam_db/status`, { headers: { origin: 'http://evil.example' } })).status).toBe(403);
  });
});

describe('без проекта и без database', () => {
  test('проект не открыт — 404; нет поля database — off с подсказкой', async () => {
    const none = await serveMiddleware(createDbDataMiddleware({ project: null, env: {} }));
    const root = path.join(tmp, 'nodb');
    mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    mkdirSync(path.join(root, '.live-app-map'), { recursive: true });
    writeFileSync(path.join(root, '.live-app-map/config.ts'), "export const config = { name: 'nodb', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:5173' }] };\n");
    const project: OpenProject = { root, name: 'nodb', mapFile: '', statesFile: '' };
    const nodb = await serveMiddleware(createDbDataMiddleware({ project, env: {} }));
    try {
      expect((await fetch(`${none.url}/__lam_db/status`)).status).toBe(404);
      const status = dbStatusSchema.parse(await (await fetch(`${nodb.url}/__lam_db/status`)).json());
      expect(status).toMatchObject({ state: 'off', reason: 'в .live-app-map/config.ts нет поля database' });
      const rowsRes = await fetch(`${nodb.url}/__lam_db/rows?table=x&page=0&size=5`);
      expect(rowsRes.status).toBe(409);
    } finally {
      await Promise.all([none.close(), nodb.close()]);
      if (DB_URL === '') {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  });
});
