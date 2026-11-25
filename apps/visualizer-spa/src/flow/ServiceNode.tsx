/**
 * Нода бэкенда на холсте: домен API (имя, общий путь, роуты и экраны-вызывающие)
 * или сервис (каталог, роуты, таблицы, функции), если роутов в карте нет.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppMapNode } from '@live-app-map/schema';
import { Route, Server } from 'lucide-react';
import { useAppStore } from '../store/app-store';
import { Badge } from '@/components/ui/badge';

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
  const domain = typeof node.metadata?.['apiDomain'] === 'string';
  const Icon = domain ? Route : Server;
  return (
    <div
      className={`service-node${selected ? ' service-node--selected' : ''}`}
      data-testid="service-node"
      data-node-id={node.id}
    >
      <Handle type="target" position={Position.Left} />
      <div className="service-node__header">
        <Icon size={16} strokeWidth={1.75} aria-hidden={true} />
        <span className="service-node__title">{node.title}</span>
      </div>
      <div className="service-node__path font-mono">{node.pathPattern}</div>
      <div className="service-node__stats">
        <Badge variant="secondary">роуты {count(node, 'routes')}</Badge>
        {domain ? (
          <Badge variant="secondary">экраны {count(node, 'screens')}</Badge>
        ) : (
          <>
            <Badge variant="secondary">таблицы {count(node, 'tables')}</Badge>
            <Badge variant="secondary">функции {count(node, 'symbols')}</Badge>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}