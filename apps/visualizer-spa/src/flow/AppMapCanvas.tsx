/**
 * React Flow canvas для AppMapDocument.
 */
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { useAppStore } from '../store/app-store';
import { layoutNodes } from './layout';
import { PageNode, type PageNodeData } from './PageNode';

const nodeTypes = { page: PageNode };

export function AppMapCanvas() {
  const document = useAppStore((s) => s.document);
  const selectPage = useAppStore((s) => s.selectPage);
  const searchQuery = useAppStore((s) => s.searchQuery);

  const { nodes, edges } = useMemo(() => {
    if (!document) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }
    const pageNodes = document.nodes.filter(
      (n) => n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external',
    );
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? pageNodes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.id.toLowerCase().includes(q) ||
            n.pathPattern.toLowerCase().includes(q),
        )
      : pageNodes;

    const navEdges = document.edges.filter(
      (e) =>
        e.to &&
        e.kind !== 'wraps' &&
        e.kind !== 'parent' &&
        filtered.some((n) => n.id === e.from) &&
        filtered.some((n) => n.id === e.to),
    );

    const positions = layoutNodes(filtered, navEdges, 'LR');
    const nodes: Node[] = filtered.map((n) => {
      const pos = positions.get(n.id);
      return {
        id: n.id,
        type: 'page',
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        data: { node: n } satisfies PageNodeData,
      };
    });
    const edges: Edge[] = navEdges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to as string,
      label: e.label,
      animated: e.kind === 'redirect',
      style: { stroke: '#5b8cff' },
    }));
    return { nodes, edges };
  }, [document, searchQuery]);

  if (!document) {
    return null;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => selectPage(null)}
      onNodeClick={(_, n) => selectPage(n.id)}
    >
      <Background gap={18} color="#2a3140" />
      <MiniMap pannable zoomable />
      <Controls />
    </ReactFlow>
  );
}
