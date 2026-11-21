/**
 * Сравнение двух версий карты: экраны (ноды), связи (рёбра), роуты и таблицы
 * раздела `code`. Сравнение по id; место в коде (файл:строка) не считается
 * изменением — строки сдвигаются при любой правке файла.
 */
import type { ApiRoute, AppMapDocument, AppMapNode, DbColumn, DbTable } from '@live-app-map/schema';

/** Добавлено, пропало и изменилось — по id. */
export type DiffSection<C> = {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly C[];
};

/** Изменённая сущность и её изменённые поля. */
export type ChangedFields = { readonly id: string; readonly fields: readonly string[] };

/** Изменённая таблица: колонки по именам. */
export type ChangedTable = {
  readonly id: string;
  readonly columns: DiffSection<string>;
};

/** Разница двух документов карты. */
export type AppMapDiff = {
  readonly formatVersion: 1;
  readonly leftRevision: string;
  readonly rightRevision: string;
  readonly nodes: DiffSection<ChangedFields>;
  readonly edges: { readonly added: readonly string[]; readonly removed: readonly string[] };
  readonly routes: DiffSection<ChangedFields>;
  readonly tables: DiffSection<ChangedTable>;
};

/** Поля ноды, изменение которых показывается. */
const NODE_FIELDS: readonly (keyof AppMapNode)[] = ['pathPattern', 'url', 'title', 'kind'];

/** Поля роута, изменение которых показывается (место в коде — нет). */
const ROUTE_FIELDS: readonly (keyof ApiRoute)[] = ['method', 'path', 'serviceId', 'input', 'access', 'response', 'dbCalls', 'doc'];

/** Значение для сравнения: JSON со стабильным порядком ключей. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    typeof x === 'object' && x !== null && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  ) ?? 'undefined';
}

/** Сравнение двух наборов по id: функция `change` возвращает изменение или null. */
function diffById<T extends { readonly id: string }, C>(
  left: readonly T[],
  right: readonly T[],
  change: (l: T, r: T) => C | null,
  idOf: (c: C) => string,
): DiffSection<C> {
  const l = new Map(left.map((x) => [x.id, x]));
  const r = new Map(right.map((x) => [x.id, x]));
  const changed = [...l].flatMap(([id, lx]) => {
    const rx = r.get(id);
    const c = rx === undefined ? null : change(lx, rx);
    return c === null ? [] : [c];
  });
  return {
    added: [...r.keys()].filter((id) => !l.has(id)).sort(),
    removed: [...l.keys()].filter((id) => !r.has(id)).sort(),
    changed: changed.sort((a, b) => idOf(a).localeCompare(idOf(b))),
  };
}

/** Изменённые поля по списку ключей. */
function changedFields<T extends object>(l: T, r: T, keys: readonly (keyof T)[], id: string): ChangedFields | null {
  const fields = keys.filter((k) => stable(l[k]) !== stable(r[k])).map(String);
  return fields.length === 0 ? null : { id, fields };
}

/** Колонка с id по имени — для сравнения колонок как набора. */
function byName(columns: readonly DbColumn[]): { readonly id: string; readonly col: DbColumn }[] {
  return columns.map((col) => ({ id: col.name, col }));
}

/** Изменение таблицы: колонки (добавлены, пропали, изменились) и имя в БД. */
function tableChange(l: DbTable, r: DbTable): ChangedTable | null {
  const columns = diffById(byName(l.columns), byName(r.columns), (a, b) => (stable(a.col) === stable(b.col) ? null : a.id), (c) => c);
  const renamed = l.name !== r.name;
  const none = columns.added.length + columns.removed.length + columns.changed.length === 0;
  return none && !renamed ? null : { id: l.id, columns };
}

/**
 * Разница двух документов карты.
 *
 * @param left - было
 * @param right - стало
 * @returns добавленное, пропавшее и изменённое по экранам, связям, роутам, таблицам
 */
export function diffDocuments(left: AppMapDocument, right: AppMapDocument): AppMapDiff {
  const leftEdges = new Set(left.edges.map((e) => e.id));
  const rightEdges = new Set(right.edges.map((e) => e.id));
  const id = (c: ChangedFields): string => c.id;
  return {
    formatVersion: 1,
    leftRevision: left.revision,
    rightRevision: right.revision,
    nodes: diffById(left.nodes, right.nodes, (l, r) => changedFields(l, r, NODE_FIELDS, l.id), id),
    edges: {
      added: [...rightEdges].filter((e) => !leftEdges.has(e)).sort(),
      removed: [...leftEdges].filter((e) => !rightEdges.has(e)).sort(),
    },
    routes: diffById(left.code?.routes ?? [], right.code?.routes ?? [], (l, r) => changedFields(l, r, ROUTE_FIELDS, l.id), id),
    tables: diffById(left.code?.tables ?? [], right.code?.tables ?? [], tableChange, (c) => c.id),
  };
}

/**
 * Сколько всего изменений в разнице (0 — версии совпадают).
 *
 * @param d - разница
 * @returns число добавленных, пропавших и изменённых сущностей всех разделов
 */
export function diffChangeCount(d: AppMapDiff): number {
  const section = (s: DiffSection<unknown>): number => s.added.length + s.removed.length + s.changed.length;
  return section(d.nodes) + d.edges.added.length + d.edges.removed.length + section(d.routes) + section(d.tables);
}
