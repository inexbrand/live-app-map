/**
 * Узел галереи — вариант компонента: подпись, файл и экран страницы компонента из трансляции.
 */
import type { Node, NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { GalleryItem } from '../../lib/components-gallery/gallery';
import { componentSnapshotSrc } from '../../lib/components-gallery/snapshot';
import { COMPONENT_VIEWPORT, mountedComponentIds } from '../../lib/components-gallery/stream-screens';
import { useGatewayStore } from '../../store/gateway-store';
import { computeNodeLayout } from '../../lib/node-layout';
import { useComponentsStore } from '../../store/components-store';
import { ScreenView } from '../../flow/page-node/ScreenView';

export type ComponentNodeData = { readonly item: GalleryItem };
export type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

/** Размеры узла: окно страницы компонента в масштабе 0,75. */
export const COMPONENT_LAYOUT = computeNodeLayout(COMPONENT_VIEWPORT, 0.75);

/** Видимость узла в окне холста → стор (по ней узел попадает в трансляцию). */
function useVisibility(id: string): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const setVisible = useComponentsStore((s) => s.setVisible);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === 'undefined') {
      setVisible(id, true);
      return () => setVisible(id, false);
    }
    const io = new IntersectionObserver((entries) => setVisible(id, entries.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => {
      io.disconnect();
      setVisible(id, false);
    };
  }, [id, setVisible]);
  return ref;
}

/** Узел варианта. */
function ComponentNodeView({ data }: NodeProps<ComponentFlowNode>) {
  const { item } = data;
  const ref = useVisibility(item.id);
  const mounted = useComponentsStore((s) => mountedComponentIds(s.gallery, s.visible).includes(item.id));
  // Вне живых — снимок сервиса снимков, как у замороженных экранов карты
  const gatewayPort = useGatewayStore((s) => s.port);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const snapshot = snapshotFailed ? null : componentSnapshotSrc(item, gatewayPort);
  return (
    <div
      ref={ref}
      className="flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm"
      style={{ width: COMPONENT_LAYOUT.outerWidth }}
      data-testid="component-node"
      data-component-id={item.id}
    >
      <div className="flex items-baseline justify-between gap-2 px-2 pt-2">
        <span className="truncate text-sm font-medium">{item.label}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.exportName}</span>
      </div>
      <div className="truncate px-2 pb-1.5 font-mono text-xs text-muted-foreground" title={item.file}>
        {item.file}
      </div>
      <div className="relative mx-2 mb-2 overflow-hidden rounded-md border bg-background" style={{ width: COMPONENT_LAYOUT.contentWidth, height: COMPONENT_LAYOUT.contentHeight }}>
        <ScreenView nodeId={item.id} title={item.label} url={item.url} viewport={COMPONENT_LAYOUT.viewport} layout={COMPONENT_LAYOUT} mounted={mounted} interactive={false} snapshot={snapshot} onSnapshotError={() => setSnapshotFailed(true)} />
      </div>
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeView);
