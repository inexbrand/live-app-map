/**
 * ER-схема всех таблиц на React Flow: карточки двигаются, клик выбирает таблицу,
 * связи выбранной таблицы подсвечены, выбор из списка подводит камеру к карточке.
 */
import { useEffect, useMemo } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DbTable } from '@live-app-map/schema';
import { erdGraph } from '../../lib/erd-model';
import { TableCard, type TableNode } from './TableCard';

const nodeTypes = { table: TableCard };

/** Свойства схемы. */
export type ErdCanvasProps = {
  readonly tables: readonly DbTable[];
  /** Выбранная таблица (exportName) или null. */
  readonly selected: string | null;
  readonly onSelect: (exportName: string) => void;
};

function toNodes(tables: readonly DbTable[], selected: string | null): TableNode[] {
  return erdGraph(tables).nodes.map((n) => ({
    id: n.id,
    type: 'table',
    position: { x: n.x, y: n.y },
    data: { table: n.table, active: n.id === selected },
  }));
}

/** Камера к выбранной карточке при смене выбора. */
function useFocusSelected(selected: string | null): void {
  const flow = useReactFlow();
  useEffect(() => {
    if (selected !== null) {
      void flow.fitView({ nodes: [{ id: selected }], duration: 300, maxZoom: 1 });
    }
  }, [flow, selected]);
}

function ErdFlow(props: ErdCanvasProps) {
  const { tables, selected, onSelect } = props;
  const graph = useMemo(() => erdGraph(tables), [tables]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>(toNodes(tables, selected));
  // Новые таблицы — новая раскладка; смена выбора меняет только отметку, позиции остаются
  useEffect(() => setNodes(toNodes(tables, null)), [tables, setNodes]);
  useEffect(() => setNodes((ns) => ns.map((n) => (n.data.active === (n.id === selected) ? n : { ...n, data: { ...n.data, active: n.id === selected } }))), [selected, setNodes]);
  useFocusSelected(selected);
  const edges = useMemo(
    (): Edge[] =>
      graph.edges.map((e) => {
        const on = selected !== null && (e.source === selected || e.target === selected);
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
          type: 'smoothstep',
          animated: on,
          className: on ? 'erd-edge erd-edge--on' : 'erd-edge',
          ...(e.label === undefined || !on ? {} : { label: e.label }),
        };
      }),
    [graph, selected],
  );
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => onSelect(n.id)}
      nodesConnectable={false}
      fitView
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

/** ER-схема таблиц. */
export function ErdCanvas(props: ErdCanvasProps) {
  return (
    <div className="erd" data-testid="erd-canvas">
      <ReactFlowProvider>
        <ErdFlow {...props} />
      </ReactFlowProvider>
    </div>
  );
}
