/**
 * Адрес БД из config.database: разбор env-файла, порядок источников, проверка хоста.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LamProjectConfig } from '@live-app-map/sdk';
import { dbTargetOf, isLocalDbHost, parseEnvText, resolveDbTarget } from './db-target';

const root = mkdtempSync(path.join(tmpdir(), 'lam-db-target-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const base: LamProjectConfig = { name: 'p', apps: [] };

describe('parseEnvText', () => {
  test('KEY=VALUE, export, кавычки, комментарии, = внутри значения', () => {
    const vars = parseEnvText('# коммент\n\nA=1\nexport B="два слова"\nC=\'x=y\'\nD=postgres://u:p@h/db?x=1 # хвост\nбез_равно\n=пусто\r\nE=');
    expect([...vars]).toEqual([['A', '1'], ['B', 'два слова'], ['C', 'x=y'], ['D', 'postgres://u:p@h/db?x=1'], ['E', '']]);
  });
});

describe('isLocalDbHost', () => {
  test('только localhost, 127.0.0.1, ::1; несколько хостов — все локальные', () => {
    expect(['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]', 'localhost,127.0.0.1'].map(isLocalDbHost)).toEqual([true, true, true, true, true, true]);
    expect(['db.example.com', '10.0.0.5', '127.0.0.2', 'localhost.evil.com', 'localhost,db.example.com', ''].map(isLocalDbHost)).toEqual([false, false, false, false, false, false]);
  });
});

describe('dbTargetOf', () => {
  test('локальный хост — запись; чужой — только чтение с причиной; пароль не попадает в host/database', () => {
    expect(dbTargetOf('postgres://u:secret@localhost:16432/korbor', 'X')).toEqual({
      ok: true,
      target: { url: 'postgres://u:secret@localhost:16432/korbor', host: 'localhost', database: 'korbor', writable: true },
    });
    expect(dbTargetOf('postgresql://u@[::1]:5432/db', 'X')).toMatchObject({ ok: true, target: { host: '::1', writable: true } });
    expect(dbTargetOf('postgres://u:secret@db.example.com/prod', 'X')).toEqual({
      ok: true,
      target: {
        url: 'postgres://u:secret@db.example.com/prod',
        host: 'db.example.com',
        database: 'prod',
        writable: false,
        readOnlyReason: 'хост БД db.example.com не локальный — запись разрешена только для localhost, 127.0.0.1, ::1',
      },
    });
  });

  test('не postgres:// или без имени базы — off с подсказкой', () => {
    expect(dbTargetOf('mysql://h/db', 'DATABASE_URL из env')).toEqual({
      ok: false,
      off: { state: 'off', reason: 'DATABASE_URL из env: адрес не postgres://', hint: 'впишите адрес вида postgres://пользователь:пароль@localhost:5432/имя_бд' },
    });
    expect(dbTargetOf('postgres://localhost:5432', 'X')).toMatchObject({ ok: false, off: { reason: 'X: в адресе нет имени базы' } });
  });
});

describe('resolveDbTarget', () => {
  test('нет поля database — off: что вписать в config.ts', () => {
    const r = resolveDbTarget(base, root, {});
    expect(r).toMatchObject({ ok: false, off: { state: 'off', reason: 'в .live-app-map/config.ts нет поля database' } });
    expect(r.ok ? '' : r.off.hint).toContain("database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' }");
  });

  test('переменная окружения важнее файла; без неё — значение из envFile', () => {
    writeFileSync(path.join(root, 'dev.env'), 'DATABASE_URL=postgres://u@127.0.0.1:1/from_file\n');
    const config: LamProjectConfig = { ...base, database: { urlEnv: 'DATABASE_URL', envFile: 'dev.env' } };
    expect(resolveDbTarget(config, root, { DATABASE_URL: 'postgres://u@localhost:2/from_env' })).toMatchObject({ ok: true, target: { database: 'from_env' } });
    expect(resolveDbTarget(config, root, { DATABASE_URL: '  ' })).toMatchObject({ ok: true, target: { database: 'from_file', host: '127.0.0.1' } });
  });

  test('нет переменной: без envFile, файла нет, в файле нет ключа — у каждого своя причина', () => {
    const file = path.join(root, 'other.env');
    writeFileSync(file, 'OTHER=1\n');
    const reasons = [
      resolveDbTarget({ ...base, database: { urlEnv: 'PG' } }, root, {}),
      resolveDbTarget({ ...base, database: { urlEnv: 'PG', envFile: 'нет.env' } }, root, {}),
      resolveDbTarget({ ...base, database: { urlEnv: 'PG', envFile: 'other.env' } }, root, {}),
    ].map((r) => (r.ok ? 'ok' : r.off.reason));
    expect(reasons).toEqual([
      'переменной PG нет в окружении dev-сервера',
      `переменной PG нет в окружении, файла ${path.join(root, 'нет.env')} нет`,
      `в ${file} нет PG`,
    ]);
  });
});
