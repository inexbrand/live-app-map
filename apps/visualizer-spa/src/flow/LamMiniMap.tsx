/**
 * Мини-карта холста: размер по пропорциям раскладки, рамки групп контуром,
 * экраны цветом группы, клик центрирует холст в точке клика.
 */
import { MiniMap, useReactFlow, type Node } from '@xyflow/react';
import type { AppMapNode } from '@live-app-map/schema';
import { minimapFill, type MinimapNodeKind, type MinimapSize } from './minimap';

/** Свойства мини-карты. */
export type LamMiniMapProps = {
  readonly size: MinimapSize;
  /** id групп карты по порядку — цвет экрана. */
  readonly groupOrder: readonly string[];
  readonly selectedPageId: string | null;
};

function hasMapNode(data: unknown): data is { node: AppMapNode } {
  return typeof data === 'object' && data !== null && 'node' in data;
}

function kindOf(n: Node, selectedPageId: string | null): MinimapNodeKind {
  if (n.type === 'groupFrame') {
    return { kind: 'frame' };
  }
  if (n.type === 'service') {
    return { kind: 'service' };
  }
  const group = hasMapNode(n.data) ? n.data.node.groupIds?.[0] : undefined;
  return { kind: 'page', group, selected: n.id === selectedPageId };
}

/**
 * Мини-карта внутри ReactFlow.
 */
export function LamMiniMap({ size, groupOrder, selectedPageId }: LamMiniMapProps) {
  const flow = useReactFlow();
  return (
    <MiniMap
      pannable
      zoomable
      // Без полей вокруг нод: React Flow двигает холст по масштабу без учёта полей — рамка отставала бы от курсора на ~4 %.
      offsetScale={0}
      style={{ width: size.width, height: size.height }}
      nodeColor={(n) => minimapFill(kindOf(n, selectedPageId), groupOrder)}
      nodeStrokeColor={(n) => (n.type === 'groupFrame' ? '#5c5c5c' : 'transparent')}
      nodeStrokeWidth={2}
      nodeClassName={(n) => (n.type === 'groupFrame' ? 'lam-minimap-frame' : '')}
      nodeBorderRadius={2}
      maskStrokeColor="#e5e5e5"
      maskStrokeWidth={1}
      ariaLabel="Мини-карта: клик — перейти к месту"
      onClick={(_, at) => {
        void flow.setCenter(at.x, at.y, { zoom: flow.getZoom(), duration: 200 });
      }}
    />
  );
}
