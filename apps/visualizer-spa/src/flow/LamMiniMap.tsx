/**
 * Мини-карта холста: размер по пропорциям раскладки, рамки групп контуром,
 * экраны цветом группы, клик центрирует холст в точке клика.
 */
import { MiniMap, useReactFlow, type Node } from '@xyflow/react';
import type { AppMapNode } from '@live-app-map/schema';
import { stateNodeInfo } from '../lib/state-nodes';
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
 * Класс ноды мини-карты: вид ноды; у узла-состояния ещё `lam-minimap-state` —
 * так экраны отличаются от их состояний (в каталоге карт состояния не считаются экранами).
 */
function minimapClass(n: Node, selectedPageId: string | null): string {
  const base = `lam-minimap-${kindOf(n, selectedPageId).kind}`;
  return hasMapNode(n.data) && stateNodeInfo(n.data.node) !== null ? `${base} lam-minimap-state` : base;
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
      nodeStrokeColor={(n) => (n.type === 'groupFrame' ? 'var(--edge)' : 'transparent')}
      nodeStrokeWidth={2}
      nodeClassName={(n) => minimapClass(n, selectedPageId)}
      nodeBorderRadius={2}
      maskStrokeColor="var(--foreground)"
      maskStrokeWidth={1}
      ariaLabel="Мини-карта: клик — перейти к месту"
      onClick={(_, at) => {
        void flow.setCenter(at.x, at.y, { zoom: flow.getZoom(), duration: 200 });
      }}
    />
  );
}
