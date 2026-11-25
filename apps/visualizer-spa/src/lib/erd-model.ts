/**
 * ER-схема вида «База данных»: карточка на таблицу, связь от колонки внешнего
 * ключа к колонке цели, раскладка dagre слева направо.
 */
import dagre from '@dagrejs/dagre';
import type { DbTable } from '@live-app-map/schema';

/** Ширина карточки таблицы, px. */
export const ERD_NODE_WIDTH = 260;
/** Высота шапки карточки, px. */
export const ERD_HEADER_HEIGHT = 36;
/** Высота строки колонки, px. */
export const ERD_ROW_HEIGHT = 24;

/** Карточка таблицы на схеме: id — exportName таблицы. */
export type ErdNode = {
  readonly id: string;
  readonly table: DbTable;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Связь FK: ручки — `<колонка>:out` у источника и `<колонка>:in` у цели. */
export type ErdEdge = {
  readonly id: string;
  readonly source: string;
  readonly sourceHandle: string;
  readonly target: string;
  readonly targetHandle: string;
  /** on delete, если задан. */
  readonly label?: string;
};

/** Схема: карточки и связи. */
export type ErdGraph = { readonly nodes: readonly ErdNode[]; readonly edges: readonly ErdEdge[] };

/** Ручка колонки-источника связи. */
export function outHandle(column: string): string {
  return `${column}:out`;
}

/** Ручка колонки-цели связи. */
export function inHandle(column: string): string {
  return `${column}:in`;
}

function edgesOf(tables: readonly DbTable[]): ErdEdge[] {
  const known = new Set(tables.map((t) => t.exportName));
  return tables.flatMap((t) =>
    t.columns.flatMap((c) => {
      const ref = c.references;
      if (ref === undefined || !known.has(ref.table)) {
        return [];
      }
      return [
        {
          id: `${t.exportName}.${c.name}->${ref.table}.${ref.column}`,
          source: t.exportName,
          sourceHandle: outHandle(c.name),
          target: ref.table,
          targetHandle: inHandle(ref.column),
          ...(ref.onDelete === undefined ? {} : { label: ref.onDelete }),
        },
      ];
    }),
  );
}

/**
 * Схема таблиц с раскладкой.
 *
 * @param tables - таблицы карты
 * @returns карточки с координатами левого верхнего угла и связи
 */
export function erdGraph(tables: readonly DbTable[]): ErdGraph {
  const edges = edgesOf(tables);
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 120, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) {
    g.setNode(t.exportName, { width: ERD_NODE_WIDTH, height: ERD_HEADER_HEIGHT + t.columns.length * ERD_ROW_HEIGHT });
  }
  for (const e of edges) {
    if (e.source !== e.target) {
      g.setEdge(e.source, e.target, {}, e.id);
    }
  }
  dagre.layout(g);
  const nodes = tables.map((t): ErdNode => {
    const p = g.node(t.exportName);
    return { id: t.exportName, table: t, x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height };
  });
  return { nodes, edges };
}
