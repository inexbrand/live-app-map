/**
 * ER-схема вида «База данных»: карточка на таблицу, связь от колонки внешнего
 * ключа к колонке цели. Связанные таблицы — dagre снизу вверх (на кого ссылаются —
 * выше): схема выходит широкой, под горизонтальную панель; слева направо на 75
 * таблицах korbor было 3300×12758, снизу вверх — 12636×5436. Таблицы без связей —
 * рядами под схемой.
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

/** Зазор между карточками, px. */
const GAP = 32;

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
  const between = edges.filter((e) => e.source !== e.target);
  const linked = new Set(between.flatMap((e) => [e.source, e.target]));
  const placed = layoutLinked(
    tables.filter((t) => linked.has(t.exportName)),
    between,
  );
  const bottom = placed.reduce((m, n) => Math.max(m, n.y + n.height), 0);
  const width = placed.reduce((m, n) => Math.max(m, n.x + n.width), 0);
  const alone = packRows(
    tables.filter((t) => !linked.has(t.exportName)),
    placed.length === 0 ? 0 : bottom + GAP * 3,
    Math.max(width, ERD_NODE_WIDTH * 6),
  );
  const byId = new Map([...placed, ...alone].map((n) => [n.id, n]));
  return { nodes: tables.flatMap((t) => byId.get(t.exportName) ?? []), edges };
}

function heightOf(t: DbTable): number {
  return ERD_HEADER_HEIGHT + t.columns.length * ERD_ROW_HEIGHT;
}

/** Связанные таблицы: dagre снизу вверх, левый верхний угол от (0, 0). */
function layoutLinked(tables: readonly DbTable[], edges: readonly ErdEdge[]): ErdNode[] {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'BT', nodesep: GAP, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) {
    g.setNode(t.exportName, { width: ERD_NODE_WIDTH, height: heightOf(t) });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target, {}, e.id);
  }
  dagre.layout(g);
  return tables.map((t): ErdNode => {
    const p = g.node(t.exportName);
    return { id: t.exportName, table: t, x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height };
  });
}

/** Таблицы без связей рядами шириной до maxWidth, начиная с top. */
function packRows(tables: readonly DbTable[], top: number, maxWidth: number): ErdNode[] {
  const out: ErdNode[] = [];
  let x = 0;
  let y = top;
  let rowHeight = 0;
  for (const t of tables) {
    if (x > 0 && x + ERD_NODE_WIDTH > maxWidth) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    const height = heightOf(t);
    out.push({ id: t.exportName, table: t, x, y, width: ERD_NODE_WIDTH, height });
    x += ERD_NODE_WIDTH + GAP;
    rowHeight = Math.max(rowHeight, height);
  }
  return out;
}
