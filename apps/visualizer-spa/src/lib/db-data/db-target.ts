/**
 * Куда подключаться: адрес Postgres из `config.database` проекта (Node, только dev-сервер).
 *
 * Адрес берётся из переменной окружения dev-сервера, а если её нет — из файла env проекта.
 * Запасного адреса нет: не нашли — состояние `off` с причиной и подсказкой, что вписать.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LamProjectConfig } from '@live-app-map/sdk';
import type { DbStatus } from './contract';

/** Хосты, на которых разрешена запись. */
export const LOCAL_DB_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

/** Цель подключения: адрес и то, что можно показать без пароля. */
export type DbTarget = {
  readonly url: string;
  readonly host: string;
  readonly database: string;
  readonly writable: boolean;
  /** Почему только чтение; есть, когда writable = false. */
  readonly readOnlyReason?: string;
};

/** Состояние «не подключено». */
export type DbOff = Extract<DbStatus, { state: 'off' }>;

/** Итог поиска адреса. */
export type DbTargetResult = { readonly ok: true; readonly target: DbTarget } | { readonly ok: false; readonly off: DbOff };

/**
 * Разбирает текст env-файла: строки `KEY=VALUE`, `export KEY=VALUE`, кавычки снимаются,
 * пустые строки и `#`-комментарии пропускаются.
 *
 * @param text - содержимое файла
 * @returns переменные файла
 */
export function parseEnvText(text: string): ReadonlyMap<string, string> {
  const vars = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    const eq = line.indexOf('=');
    if (line === '' || line.startsWith('#') || eq <= 0) {
      continue;
    }
    vars.set(line.slice(0, eq).trim(), envValue(line.slice(eq + 1).trim()));
  }
  return vars;
}

/** Значение без кавычек; у значения без кавычек срезается хвост ` # комментарий`. */
function envValue(v: string): string {
  const q = v[0];
  if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) {
    return v.slice(1, -1);
  }
  return v.replace(/\s+#.*$/, '');
}

/**
 * Хост локальный: запись разрешена только для localhost, 127.0.0.1, ::1.
 * Несколько хостов через запятую — локальными должны быть все.
 *
 * @param host - hostname из адреса (IPv6 в скобках или без)
 */
export function isLocalDbHost(host: string): boolean {
  const hosts = host.split(',').map((h) => h.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1'));
  return hosts.length > 0 && hosts.every((h) => LOCAL_DB_HOSTS.has(h));
}

/**
 * Цель по адресу postgres://.
 *
 * @param url - адрес из переменной
 * @param source - откуда адрес (для текста ошибки): `DATABASE_URL из dev.local.env`
 * @returns цель или off, если адрес не postgres://
 */
export function dbTargetOf(url: string, source: string): DbTargetResult {
  const u = URL.parse(url);
  if (u === null || (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') || u.hostname === '') {
    return off(`${source}: адрес не postgres://`, 'впишите адрес вида postgres://пользователь:пароль@localhost:5432/имя_бд');
  }
  const host = u.hostname.replace(/^\[(.*)\]$/, '$1');
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (database === '') {
    return off(`${source}: в адресе нет имени базы`, 'допишите имя базы в конец адреса: postgres://…@localhost:5432/имя_бд');
  }
  const writable = isLocalDbHost(host);
  return {
    ok: true,
    target: {
      url,
      host,
      database,
      writable,
      ...(writable ? {} : { readOnlyReason: `хост БД ${host} не локальный — запись разрешена только для localhost, 127.0.0.1, ::1` }),
    },
  };
}

function off(reason: string, hint: string): DbTargetResult {
  return { ok: false, off: { state: 'off', reason, hint } };
}

/**
 * Ищет адрес по `config.database`: сначала переменная окружения, затем файл env проекта.
 *
 * @param config - конфиг проекта
 * @param root - корень проекта (от него считается envFile)
 * @param env - окружение dev-сервера
 * @returns цель или off с причиной и подсказкой
 */
export function resolveDbTarget(config: LamProjectConfig, root: string, env: Readonly<Record<string, string | undefined>>): DbTargetResult {
  const db = config.database;
  if (db === undefined) {
    return off(
      'в .live-app-map/config.ts нет поля database',
      "впишите в config.ts: database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' } — имя переменной с адресом Postgres и файл env от корня проекта",
    );
  }
  const fromEnv = env[db.urlEnv]?.trim() ?? '';
  if (fromEnv !== '') {
    return dbTargetOf(fromEnv, `${db.urlEnv} из окружения`);
  }
  if (db.envFile === undefined) {
    return off(
      `переменной ${db.urlEnv} нет в окружении dev-сервера`,
      `задайте ${db.urlEnv}=postgres://… при запуске или добавьте envFile в database (файл env от корня проекта)`,
    );
  }
  const file = path.join(root, db.envFile);
  if (!existsSync(file)) {
    return off(`переменной ${db.urlEnv} нет в окружении, файла ${file} нет`, `создайте ${file} со строкой ${db.urlEnv}=postgres://…@localhost:5432/имя_бд`);
  }
  const fromFile = parseEnvText(readFileSync(file, 'utf8')).get(db.urlEnv)?.trim() ?? '';
  if (fromFile === '') {
    return off(`в ${file} нет ${db.urlEnv}`, `добавьте в ${file} строку ${db.urlEnv}=postgres://…@localhost:5432/имя_бд`);
  }
  return dbTargetOf(fromFile, `${db.urlEnv} из ${db.envFile}`);
}
