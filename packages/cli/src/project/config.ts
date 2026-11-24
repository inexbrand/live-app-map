/**
 * Конфиг проекта Live App Map: `<проект>/.live-app-map/config.ts` (`export const config`).
 * Чтение — импортом Bun (TypeScript без сборки), проверка — до скана: пустое или
 * неверное поле останавливает скан с текстом, что вписать.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { LamApp, LamProjectConfig } from '@live-app-map/sdk';

/** Папка проекта внутри приложения. */
export const PROJECT_DIR_NAME = '.live-app-map';

/** Файлы папки проекта. */
export const PROJECT_FILES = { config: 'config.ts', states: 'states.ts', map: 'map.json' };

/** id приложения: строчные латинские, цифры, дефис. */
const APP_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Путь файла папки проекта.
 *
 * @param projectRoot - корень проекта (там, где лежит .live-app-map)
 * @param name - файл папки
 * @returns абсолютный путь
 */
export function projectFile(projectRoot: string, name: keyof typeof PROJECT_FILES): string {
  return path.join(path.resolve(projectRoot), PROJECT_DIR_NAME, PROJECT_FILES[name]);
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function filled(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Ошибки одного приложения; where — «apps[0]». */
function appErrors(raw: unknown, where: string, root: string): string[] {
  if (!isRecord(raw)) {
    return [`${where}: ожидается объект { id, label, dir, baseUrl }`];
  }
  const errors: string[] = [];
  if (!filled(raw['id']) || !APP_ID.test(raw['id'])) {
    errors.push(`${where}.id: впишите id из строчных латинских букв, цифр и дефиса, например id: 'miniapp'`);
  }
  if (!filled(raw['label'])) {
    errors.push(`${where}.label: впишите подпись группы на карте, например label: 'Мини-приложение'`);
  }
  if (!filled(raw['dir'])) {
    errors.push(`${where}.dir: впишите каталог приложения от корня проекта, например dir: 'apps/miniapp'`);
  } else if (!existsSync(path.join(root, raw['dir']))) {
    errors.push(`${where}.dir: каталога ${path.join(root, raw['dir'])} нет — проверьте путь от корня проекта`);
  }
  if (!filled(raw['baseUrl']) || URL.parse(raw['baseUrl']) === null) {
    errors.push(`${where}.baseUrl: впишите адрес dev-сервера, например baseUrl: 'http://localhost:5173'`);
  }
  const roles = raw['roles'];
  if (roles !== undefined && (!Array.isArray(roles) || !roles.every(filled))) {
    errors.push(`${where}.roles: список непустых id ролей, например roles: ['admin']`);
  }
  return errors;
}

/** Конец связи: `<id приложения>:<путь маршрута>`, путь с «/». */
const LINK_END = /^([a-z0-9][a-z0-9-]*):(\/.*)$/;

/** Ошибки связей: формат концов и известные id приложений. */
function linksErrors(raw: unknown, appIds: ReadonlySet<string>): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return ["links: список связей, например links: [{ from: 'miniapp:/feed', to: 'miniapp:/wallet', label: 'Таб' }]"];
  }
  return raw.flatMap((l, i): string[] => {
    if (!isRecord(l)) {
      return [`links[${i}]: ожидается объект { from, to, label? }`];
    }
    const ends = (['from', 'to'] as const).flatMap((k): string[] => {
      const v = l[k];
      const m = typeof v === 'string' ? LINK_END.exec(v) : null;
      if (m === null) {
        return [`links[${i}].${k}: впишите '<id приложения>:<путь маршрута>', например 'miniapp:/feed'`];
      }
      return appIds.has(m[1] ?? '') ? [] : [`links[${i}].${k}: приложения ${m[1]} нет в apps`];
    });
    const label = l['label'];
    return label === undefined || filled(label) ? ends : [...ends, `links[${i}].label: непустая строка или без поля`];
  });
}

/** Ошибки списка бэкенда. */
function backendErrors(raw: unknown, root: string): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || !raw.every(filled)) {
    return [`backend: список каталогов от корня проекта, например backend: ['apps/api']`];
  }
  return raw.filter((d) => !existsSync(path.join(root, d))).map((d) => `backend: каталога ${path.join(root, d)} нет — проверьте путь от корня проекта`);
}

/**
 * Проверяет экспорт `config`: все обязательные поля заполнены, каталоги есть.
 *
 * @param raw - значение экспорта config
 * @param root - корень проекта (от него считаются dir и backend)
 * @returns конфиг или список ошибок с подсказками
 */
export function checkProjectConfig(raw: unknown, root: string): { readonly ok: true; readonly config: LamProjectConfig } | { readonly ok: false; readonly errors: readonly string[] } {
  if (!isRecord(raw)) {
    return { ok: false, errors: ['нет export const config: LamProjectConfig — добавьте его в config.ts'] };
  }
  const errors: string[] = [];
  if (!filled(raw['name'])) {
    errors.push("name: впишите имя проекта, например name: 'korbor'");
  }
  const apps = raw['apps'];
  if (!Array.isArray(apps) || apps.length === 0) {
    errors.push("apps: добавьте хотя бы одно приложение { id, label, dir, baseUrl }");
  } else {
    errors.push(...apps.flatMap((a, i) => appErrors(a, `apps[${i}]`, root)));
    const ids = apps.flatMap((a) => (isRecord(a) && filled(a['id']) ? [a['id']] : []));
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup !== undefined) {
      errors.push(`apps: id ${dup} повторяется — у каждого приложения свой id`);
    }
  }
  errors.push(...backendErrors(raw['backend'], root));
  const appIds = new Set(Array.isArray(apps) ? apps.flatMap((a) => (isRecord(a) && filled(a['id']) ? [a['id']] : [])) : []);
  errors.push(...linksErrors(raw['links'], appIds));
  return errors.length > 0 ? { ok: false, errors } : { ok: true, config: toConfig(raw, apps) };
}

/** Проверенный объект как LamProjectConfig (поля уже проверены поштучно). */
function toConfig(raw: Readonly<Record<string, unknown>>, apps: unknown): LamProjectConfig {
  const list = Array.isArray(apps) ? apps.filter(isRecord) : [];
  const backend = raw['backend'];
  const links = Array.isArray(raw['links']) ? raw['links'].filter(isRecord) : null;
  return {
    name: String(raw['name']),
    apps: list.map((a): LamApp => ({
      id: String(a['id']),
      label: String(a['label']),
      dir: String(a['dir']),
      baseUrl: String(a['baseUrl']),
      ...(Array.isArray(a['roles']) ? { roles: a['roles'].map(String) } : {}),
    })),
    ...(Array.isArray(backend) ? { backend: backend.map(String) } : {}),
    ...(links === null
      ? {}
      : { links: links.map((l) => ({ from: String(l['from']), to: String(l['to']), ...(typeof l['label'] === 'string' ? { label: l['label'] } : {}) })) }),
  };
}

/**
 * Читает и проверяет `<проект>/.live-app-map/config.ts`.
 *
 * @param projectRoot - корень проекта
 * @returns конфиг
 * @throws Error с адресом файла и списком полей, которые надо заполнить
 */
export async function loadProjectConfig(projectRoot: string): Promise<LamProjectConfig> {
  const root = path.resolve(projectRoot);
  const file = projectFile(root, 'config');
  if (!existsSync(file)) {
    throw new Error(`нет ${file}: создайте его с export const config: LamProjectConfig (name, apps)`);
  }
  // Путь с ?v=<mtime>: Bun перечитывает модуль после правки файла (у file:// URL запрос кэш не сбрасывает).
  const mod: unknown = await import(`${file}?v=${statSync(file).mtimeMs}`);
  const checked = checkProjectConfig(isRecord(mod) ? mod['config'] : undefined, root);
  if (!checked.ok) {
    throw new Error(`${file}:\n${checked.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  return checked.config;
}
