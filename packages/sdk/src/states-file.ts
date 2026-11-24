/**
 * Серверная сторона: поиск папки проекта и выбор состояния/варианта из states.ts.
 */
import type { LamComponentFixtures, LamScreenStates } from './project';
import type { LamStatePayload } from './runtime/api';
import { lamParseStateId } from './runtime/api';

/** Папка проекта Live App Map внутри проекта приложения. */
export const LAM_DIR = '.live-app-map';

/**
 * Каталог проекта: первый вверх от start, где есть `.live-app-map/states.ts`.
 *
 * @param start - откуда искать (root Vite)
 * @param exists - проверка файла (fs.existsSync)
 * @param join - склейка пути (path.join)
 * @param dirname - родитель (path.dirname)
 */
export function findProjectDir(start: string, exists: (p: string) => boolean, join: (...p: string[]) => string, dirname: (p: string) => string): string | null {
  let dir = start;
  for (let i = 0; i < 64; i++) {
    if (exists(join(dir, LAM_DIR, 'states.ts'))) {
      return dir;
    }
    const up = dirname(dir);
    if (up === dir) {
      return null;
    }
    dir = up;
  }
  return null;
}

/** Модуль states.ts: экспорты screens и components (любой может отсутствовать). */
export type LamStatesModule = { readonly screens?: LamScreenStates; readonly components?: LamComponentFixtures };

/** Итог поиска состояния: описание или текст ошибки с подсказкой. */
export type LamStateLookup = { readonly ok: true; readonly payload: LamStatePayload } | { readonly ok: false; readonly error: string };

/**
 * Описание состояния по id из lam_state.
 *
 * @param mod - загруженный states.ts
 * @param id - «<экран>/<состояние>» или «component:<ключ>/<вариант>»
 * @param file - путь states.ts (для текста ошибки)
 */
export function lookupState(mod: LamStatesModule, id: string, file: string): LamStateLookup {
  const ref = lamParseStateId(id);
  if (ref === null) {
    return { ok: false, error: 'lam_state «' + id + '» не в формате «<id экрана>/<id состояния>» или «component:<файл#экспорт>/<вариант>»' };
  }
  if (ref.kind === 'component') {
    const list = mod.components?.[ref.target];
    if (list === undefined) {
      return { ok: false, error: 'В ' + file + ' нет components["' + ref.target + '"]. Есть: ' + listOrNone(Object.keys(mod.components ?? {})) };
    }
    const v = list.find((x) => x.id === ref.state);
    return v === undefined
      ? { ok: false, error: 'У компонента «' + ref.target + '» нет варианта «' + ref.state + '». Есть: ' + listOrNone(list.map((x) => x.id)) }
      : { ok: true, payload: { id: v.id, label: v.label, api: v.api } };
  }
  const states = mod.screens?.[ref.target];
  if (states === undefined) {
    return { ok: false, error: 'В ' + file + ' нет screens["' + ref.target + '"]. Есть: ' + listOrNone(Object.keys(mod.screens ?? {})) };
  }
  const s = states.find((x) => x.id === ref.state);
  return s === undefined
    ? { ok: false, error: 'У экрана «' + ref.target + '» нет состояния «' + ref.state + '». Есть: ' + listOrNone(states.map((x) => x.id)) }
    : { ok: true, payload: { id: s.id, label: s.label, api: s.api } };
}

function listOrNone(items: readonly string[]): string {
  return items.length === 0 ? '(пусто)' : items.join(', ');
}

/**
 * Разбор ссылки «<файл от корня проекта>#<экспорт>».
 *
 * @param ref - ключ компонента или опция wrapper
 * @returns файл и экспорт или null
 */
export function parseExportRef(ref: string): { readonly file: string; readonly name: string } | null {
  const hash = ref.lastIndexOf('#');
  if (hash <= 0 || hash === ref.length - 1) {
    return null;
  }
  return { file: ref.slice(0, hash), name: ref.slice(hash + 1) };
}
