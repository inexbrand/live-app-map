/**
 * Мини-карта холста: экраны и сервисы видны, рамки групп — контуром (не
 * закрывают экраны), размер SVG = размер панели (рамка вьюпорта точная),
 * клик переносит центр холста в точку, перетаскивание и колесо — как в React Flow.
 */
import { MiniMap, useReactFlow, type Node } from '@xyflow/react';

/** Размер мини-карты, px: SVG и панель одного размера. */
export const MINIMAP_SIZE = { width: 168, height: 112 };

function nodeClass(n: Node): string {
  if (n.type === 'groupFrame') return 'lam-mm-frame';
  if (n.type === 'service') return 'lam-mm-service';
  return 'lam-mm-page';
}

/** Мини-карта (внутри ReactFlow). */
export function LamMiniMap() {
  const flow = useReactFlow();
  return (
    <MiniMap
      pannable
      zoomable
      style={MINIMAP_SIZE}
      nodeClassName={nodeClass}
      nodeBorderRadius={4}
      maskStrokeColor="#e5e5e5"
      maskStrokeWidth={2}
      ariaLabel="Мини-карта: клик — перейти к месту"
      onClick={(_, pos) => {
        void flow.setCenter(pos.x, pos.y, { zoom: flow.getZoom(), duration: 200 });
      }}
    />
  );
}
