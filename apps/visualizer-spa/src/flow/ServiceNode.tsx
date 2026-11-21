/**
 * Нода сервиса бэкенда на холсте: имя, каталог, число роутов, таблиц и функций.
 * Без iframe — код сервиса открывается в правой панели.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppMapNode } from '@live-app-map/schema';
import { Server } from 'lucide-react';
import { Badge } from '../ui';
import { useAppStore } from '../store/app-store';

/** Ширина и высота ноды сервиса в мировых координатах холста. */
export { SERVICE_NODE_SIZE } from './service-node-size';

/** Данные ноды сервиса для React Flow. */
export type ServiceNodeData = { readonly node: AppMapNode };

/** Число из metadata ноды (routes / tables / symbols). */
function count(node: AppMapNode, key: string): number {
  const v = node.metadata?.[key];
  return typeof v === 'number' ? v : 0;
}

/**
 * Карточка сервиса.
 */
export function ServiceNode(props: NodeProps) {
  const data = props.data as ServiceNodeData;
  const node = data.node;
  const selected = useAppStore((s) => s.selectedPageId === node.id);
  return (
    <div
      className={`service-node${selected ? ' service-node--selected' : ''}`}
      data-testid="service-node"
      data-node-id={node.id}
    >
      <Handle type="target" position={Position.Left} />
      <div className="service-node__header">
        <Server size={16} strokeWidth={1.75} aria-hidden={true} />
        <span className="service-node__title">{node.title}</span>
      </div>
      <div className="service-node__path font-mono">{node.pathPattern}</div>
      <div className="service-node__stats">
        <Badge>роуты {count(node, 'routes')}</Badge>
        <Badge>таблицы {count(node, 'tables')}</Badge>
        <Badge>функции {count(node, 'symbols')}</Badge>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}