/**
 * Карточка таблицы на ER-схеме: имя, колонки с типом, отметки PK и FK,
 * ручки связей у каждой колонки (вход слева, выход справа).
 */
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { KeyRound, Link2 } from 'lucide-react';
import type { DbColumn, DbTable } from '@live-app-map/schema';
import { ERD_HEADER_HEIGHT, ERD_NODE_WIDTH, ERD_ROW_HEIGHT, inHandle, outHandle } from '../../lib/erd-model';

/** Данные ноды-таблицы. */
export type TableNodeData = { readonly table: DbTable; readonly active: boolean };

/** Нода-таблица React Flow. */
export type TableNode = Node<TableNodeData, 'table'>;

function ColumnLine(props: { readonly column: DbColumn }) {
  const c = props.column;
  return (
    <li className="erd-card__col" style={{ height: ERD_ROW_HEIGHT }} title={c.doc}>
      <Handle type="target" position={Position.Left} id={inHandle(c.name)} className="erd-card__handle" isConnectable={false} />
      <span className="erd-card__mark" aria-hidden="true">
        {c.primaryKey === true ? <KeyRound className="size-3" /> : c.references === undefined ? null : <Link2 className="size-3" />}
      </span>
      <span className="erd-card__col-name">{c.sqlName ?? c.name}</span>
      <span className="erd-card__col-type">
        {c.type}
        {c.notNull === true || c.primaryKey === true ? '' : '?'}
      </span>
      <Handle type="source" position={Position.Right} id={outHandle(c.name)} className="erd-card__handle" isConnectable={false} />
    </li>
  );
}

function TableCardImpl(props: NodeProps<TableNode>) {
  const { table, active } = props.data;
  return (
    <div className={`erd-card${active ? ' erd-card--on' : ''}`} style={{ width: ERD_NODE_WIDTH }} data-testid="erd-table" data-table={table.exportName}>
      <div className="erd-card__head" style={{ height: ERD_HEADER_HEIGHT }} title={table.doc}>
        {table.name}
      </div>
      <ul className="erd-card__cols">
        {table.columns.map((c) => (
          <ColumnLine key={c.name} column={c} />
        ))}
      </ul>
    </div>
  );
}

/** Карточка таблицы. */
export const TableCard = memo(TableCardImpl);
