/**
 * Поле database конфига проекта: где взять адрес Postgres для вида «База данных».
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkProjectConfig } from './config';

const root = mkdtempSync(path.join(os.tmpdir(), 'lam-config-db-'));
mkdirSync(path.join(root, 'apps/web'), { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const app = { id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1' };

describe('checkProjectConfig: database', () => {
  test('urlEnv и envFile сохраняются; без envFile — только переменная; без поля — нет database', () => {
    const full = checkProjectConfig({ name: 'p', apps: [app], database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' } }, root);
    expect(full).toEqual({ ok: true, config: { name: 'p', apps: [app], database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' } } });
    const envOnly = checkProjectConfig({ name: 'p', apps: [app], database: { urlEnv: 'PG_URL' } }, root);
    expect(envOnly).toEqual({ ok: true, config: { name: 'p', apps: [app], database: { urlEnv: 'PG_URL' } } });
    const none = checkProjectConfig({ name: 'p', apps: [app] }, root);
    expect(none.ok && 'database' in none.config).toBe(false);
  });

  test('пустое имя переменной, пустой файл, не объект — подсказка, что вписать', () => {
    const bad = checkProjectConfig({ name: 'p', apps: [app], database: { urlEnv: ' ', envFile: '' } }, root);
    expect(bad).toEqual({
      ok: false,
      errors: [
        "database.urlEnv: впишите имя переменной с адресом Postgres, например urlEnv: 'DATABASE_URL'",
        "database.envFile: файл env от корня проекта, например envFile: 'dev.local.env', или без поля",
      ],
    });
    const notObject = checkProjectConfig({ name: 'p', apps: [app], database: 'postgres://x' }, root);
    expect(notObject).toEqual({ ok: false, errors: ["database: ожидается объект, например database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' }"] });
  });

  test('файла env нет — конфиг всё равно верен (скан не ломается, вид БД скажет сам)', () => {
    const r = checkProjectConfig({ name: 'p', apps: [app], database: { urlEnv: 'DATABASE_URL', envFile: 'нет.env' } }, root);
    expect(r.ok).toBe(true);
  });
});
