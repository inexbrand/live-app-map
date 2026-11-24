/**
 * Обогащение карты приложения по конфигу проекта: состояния ролей входа и примеры
 * параметров маршрутов. Чистые функции.
 */
import type { AppMapDocument, AppMapNode, AppMapPageState } from '@live-app-map/schema';

/** Параметр адреса, которым визуализатор передаёт роль входа приложению. */
export const ROLE_QUERY_PARAM = 'lam_role';

/**
 * Состояние роли входа у экрана.
 *
 * @param appId - id приложения
 * @param role - id роли
 * @returns состояние с подстановкой роли
 */
export function roleState(appId: string, role: string): AppMapPageState {
  return {
    name: role,
    note: `Роль входа ${role}`,
    inject: { role, query: { [ROLE_QUERY_PARAM]: role }, labels: ['role', appId] },
  };
}

/** Экран с состояниями ролей (уже заданные не повторяются). */
function withRoles(n: AppMapNode, appId: string, roles: readonly string[]): AppMapNode {
  if (n.kind !== 'page') {
    return n;
  }
  const states: AppMapPageState[] = [...(n.states ?? [])];
  for (const role of roles) {
    if (!states.some((s) => s.name === role)) {
      states.push(roleState(appId, role));
    }
  }
  return states.length > 0 ? { ...n, states } : n;
}

/**
 * Каждому экрану приложения — состояние на каждую роль входа из конфига.
 *
 * @param doc - карта приложения
 * @param appId - id приложения
 * @param roles - роли приложения (пусто — карта без изменений)
 * @returns карта со состояниями ролей
 */
export function withRoleStates(doc: AppMapDocument, appId: string, roles: readonly string[]): AppMapDocument {
  return roles.length === 0 ? doc : { ...doc, nodes: doc.nodes.map((n) => withRoles(n, appId, roles)) };
}

/** Значение примера параметра: строка или сегменты catch-all. */
export type ExampleParams = Readonly<Record<string, string | readonly string[]>>;

/**
 * Примеры параметров для всех маршрутов: `[id]`, `:id` — 'demo'; обязательный
 * catch-all `[...rest]` — ['demo']; необязательный `[[...slug]]` — пусто. Реальные id
 * экранам подставляет визуализатор (sample-ids профиля входа).
 *
 * @param patterns - шаблоны путей маршрутов
 * @returns имя параметра → пример
 */
export function exampleParamsFor(patterns: readonly string[]): ExampleParams {
  const out: Record<string, string | readonly string[]> = {};
  for (const p of patterns) {
    for (const m of p.matchAll(/\[\[\.\.\.(\w+)\]\]/g)) {
      out[m[1] ?? ''] = [];
    }
    for (const m of p.matchAll(/(?<!\[)\[\.\.\.(\w+)\](?!\])/g)) {
      out[m[1] ?? ''] = ['demo'];
    }
    for (const m of p.matchAll(/(?:\[(\w+)\]|:(\w+))/g)) {
      out[m[1] ?? m[2] ?? ''] = 'demo';
    }
  }
  delete out[''];
  return out;
}
