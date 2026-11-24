/**
 * Проект на dev-сервере визуализатора (Node): `--project <каталог>` / `LAM_PROJECT`.
 *
 * - карта проекта `<проект>/.live-app-map/map.json` — в каталоге карт под id = config.name,
 *   отдаётся по {@link PROJECT_MAP_PATH};
 * - `GET /__lam_project/states` — экспорты `states.ts` как есть: `{ screens, components }`;
 *   файл перечитывается при изменении. Проект не открыт — 404, нет states.ts — пустые объекты.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadProjectConfig, projectFile } from '@live-app-map/cli/project-config';
import { buildMapCatalogEntryFor, summarizeMapFile, type ExtraCatalogItems } from '../build-map-catalog-fs';
import { errorMessage, requestPath, sendError, sendJson, type DevMiddleware } from '../dev-http';
import type { MapCatalogEntry, SkippedMapFile } from '../map-catalog';

/** Адрес карты проекта на dev-сервере. */
export const PROJECT_MAP_PATH = '/__lam_project/map.json';

/** Адрес состояний проекта. */
export const PROJECT_STATES_PATH = '/__lam_project/states';

/** Переменная окружения с каталогом проекта. */
export const PROJECT_ENV = 'LAM_PROJECT';

/** Открытый проект: корень, имя из config.ts, файлы папки. */
export type OpenProject = {
  readonly root: string;
  readonly name: string;
  readonly mapFile: string;
  readonly statesFile: string;
};

/**
 * Открывает проект из окружения: `LAM_PROJECT` (абсолютный или от cwd) → config.ts.
 *
 * @param env - окружение dev-сервера
 * @param cwd - рабочий каталог (от него считается относительный путь)
 * @returns проект или null (переменная не задана)
 * @throws Error — нет каталога или config.ts неверен (текст с подсказкой)
 */
export async function openProject(env: Readonly<Record<string, string | undefined>>, cwd: string): Promise<OpenProject | null> {
  const raw = env[PROJECT_ENV];
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  const root = path.resolve(cwd, raw);
  if (!existsSync(root)) {
    throw new Error(`${PROJECT_ENV}=${raw}: каталога ${root} нет — укажите корень проекта с папкой .live-app-map`);
  }
  const config = await loadProjectConfig(root);
  return { root, name: config.name, mapFile: projectFile(root, 'map'), statesFile: projectFile(root, 'states') };
}

/** Запись каталога для карты проекта или причина, почему её нет. */
export type ProjectCatalogItem = { readonly entry: MapCatalogEntry } | { readonly skipped: SkippedMapFile };

/**
 * Карта проекта в каталоге: id и подпись — config.name, путь — {@link PROJECT_MAP_PATH}.
 *
 * @param project - открытый проект
 * @returns запись каталога или пропуск с подсказкой
 */
export function projectCatalogItem(project: OpenProject): ProjectCatalogItem {
  if (!existsSync(project.mapFile)) {
    return { skipped: { file: project.mapFile, reason: `нет карты проекта — запустите bun run scan -- --project ${project.root}` } };
  }
  const res = summarizeMapFile(path.basename(project.mapFile), readFileSync(project.mapFile, 'utf8'));
  if (!res.ok) {
    return { skipped: { file: project.mapFile, reason: res.reason } };
  }
  return { entry: buildMapCatalogEntryFor(project.name, project.name, PROJECT_MAP_PATH, res.summary) };
}

/**
 * Карты вне папки для каталога: карта проекта или её пропуск; проекта нет — пусто.
 *
 * @param project - открытый проект или null
 * @returns записи для mapsIndexMiddleware
 */
export function projectCatalogExtra(project: OpenProject | null): ExtraCatalogItems {
  if (project === null) {
    return { maps: [], skipped: [] };
  }
  const item = projectCatalogItem(project);
  return 'entry' in item ? { maps: [item.entry], skipped: [] } : { maps: [], skipped: [item.skipped] };
}

/** Экспорты states.ts. */
export type ProjectStatesBody = { readonly screens: unknown; readonly components: unknown };

function exportOf(mod: unknown, name: string): unknown {
  return typeof mod === 'object' && mod !== null && name in mod ? Reflect.get(mod, name) : undefined;
}

/**
 * Читает экспорты states.ts. Модуль импортируется заново при новом mtime файла
 * (путь с ?v=<mtime>: Bun кэширует модуль по пути с запросом; у file:// URL запрос
 * кэш не сбрасывает), так что правка файла видна без перезапуска.
 *
 * @param statesFile - путь states.ts
 * @returns `{ screens, components }`; нет файла или экспорта — пустой объект
 */
export async function readProjectStates(statesFile: string): Promise<ProjectStatesBody> {
  if (!existsSync(statesFile)) {
    return { screens: {}, components: {} };
  }
  const version = statSync(statesFile).mtimeMs;
  const mod: unknown = await import(`${statesFile}?v=${version}`);
  return { screens: exportOf(mod, 'screens') ?? {}, components: exportOf(mod, 'components') ?? {} };
}

/** Отдаёт текст карты как JSON без кэша. */
function sendMapFile(res: Parameters<DevMiddleware>[1], file: string): void {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(readFileSync(file));
}

/**
 * Middleware проекта: карта и состояния. Монтируется всегда, чтобы без проекта
 * эти адреса отвечали 404, а не страницей SPA.
 *
 * @param project - открытый проект или null
 * @returns connect-middleware
 */
export function projectMiddleware(project: OpenProject | null): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== PROJECT_MAP_PATH && p !== PROJECT_STATES_PATH) {
      next();
      return;
    }
    if (project === null) {
      sendError(res, 404, `проект не открыт: запустите bun run dev -- --project <каталог> или задайте ${PROJECT_ENV}`);
      return;
    }
    if (p === PROJECT_MAP_PATH) {
      if (existsSync(project.mapFile)) {
        sendMapFile(res, project.mapFile);
      } else {
        sendError(res, 404, `нет ${project.mapFile} — запустите bun run scan -- --project ${project.root}`);
      }
      return;
    }
    void readProjectStates(project.statesFile).then(
      (body) => sendJson(res, 200, body),
      (err: unknown) => sendError(res, 500, `${project.statesFile}: ${errorMessage(err)}`),
    );
  };
}
