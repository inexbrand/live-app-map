/**
 * Модель вида «База данных»: таблицы, колонки, связи и какие роуты и
 * экраны их читают и пишут. Считается из раздела `code` карты.
 */
import { buildCodeIndex, tableDetail, type CodeIndex, type RouteCaller, type TableDetail } from '@live-app-map/graph';
import type { ApiRoute, AppMapDocument, DbTable } from '@live-app-map/schema';

/** Строка списка таблиц. */
export type TableRow = {
  readonly exportName: string;
  readonly name: string;
  readonly service: string;
  readonly columns: number;
  readonly reads: number;
  readonly writes: number;
  /** Внешние ключи из таблицы и на неё. */
  readonly links: number;
  readonly doc?: string;
};

/** Роут с экранами, которые его вызывают. */
export type RouteUse = {
  readonly route: ApiRoute;
  readonly screens: readonly RouteCaller[];
};

/** Детали таблицы для правой части вида. */
export type TableView = TableDetail & {
  readonly readRoutes: readonly RouteUse[];
  readonly writeRoutes: readonly RouteUse[];
};

/**
 * Индекс кода карты или null, если в карте нет таблиц.
 *
 * @param doc - документ карты
 */
export function dbIndexOf(doc: AppMapDocument | null): CodeIndex | null {
  if (doc === null || doc.code === undefined || doc.code.tables.length === 0) {
    return null;
  }
  return buildCodeIndex(doc);
}

function matches(query: string, t: DbTable): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return true;
  }
  return [t.name, t.exportName, t.doc ?? '', ...t.columns.map((c) => c.sqlName ?? c.name)].some((s) => s.toLowerCase().includes(q));
}

/**
 * Список таблиц: по запросу (имя, колонки, описание), по имени.
 *
 * @param index - индекс кода
 * @param query - строка поиска
 */
export function tableRows(index: CodeIndex, query: string): TableRow[] {
  return index.code.tables
    .filter((t) => matches(query, t))
    .flatMap((t) => {
      const d = tableDetail(index, t.exportName);
      return d === undefined
        ? []
        : [
            {
              exportName: t.exportName,
              name: t.name,
              service: d.service?.name ?? t.serviceId,
              columns: t.columns.length,
              reads: d.readBy.length,
              writes: d.writtenBy.length,
              links: d.references.length + d.referencedBy.length,
              ...(t.doc === undefined ? {} : { doc: t.doc }),
            },
          ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Детали таблицы с экранами у каждого роута.
 *
 * @param index - индекс кода
 * @param exportName - таблица
 */
export function tableView(index: CodeIndex, exportName: string): TableView | null {
  const d = tableDetail(index, exportName);
  if (d === undefined) {
    return null;
  }
  const use = (r: ApiRoute): RouteUse => ({ route: r, screens: index.callersByRoute.get(r.id) ?? [] });
  return { ...d, readRoutes: d.readBy.map(use), writeRoutes: d.writtenBy.map(use) };
}