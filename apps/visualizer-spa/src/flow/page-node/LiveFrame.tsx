/**
 * Живой экран ноды: iframe в масштабе, под ним снимок шлюза (виден, пока iframe спрятан при зуме).
 */
import type { AppMapNode, DeviceViewport } from '@live-app-map/schema';
import type { RefObject } from 'react';
import { NODE_IFRAME_ATTR } from '../../lib/gateway/use-gateway-frames';
import type { NodeLayoutMetrics } from '../../lib/node-layout';
import type { IframeSandboxPreset } from './sandbox';

/** Props живого экрана. */
export type LiveFrameProps = {
  readonly node: AppMapNode;
  readonly url: string;
  readonly viewport: DeviceViewport;
  readonly layout: NodeLayoutMetrics;
  readonly sandboxPreset: IframeSandboxPreset;
  readonly sandboxValue: string;
  /** Снимок шлюза под iframe; null — нет. */
  readonly gatewaySnapshot: string | null;
  /** Клики доходят в страницу (взаимодействие или выбор компонента). */
  readonly isInteract: boolean;
  readonly picking: boolean;
  /** Warm вне live: чуть тусклее. */
  readonly iframeDimmed: boolean;
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly onSnapshotError: () => void;
  readonly onLoad: () => void;
  readonly onError: () => void;
};

/**
 * Живой экран.
 *
 * @param props - адрес, окно, масштаб, sandbox и обработчики
 */
export function LiveFrame(props: LiveFrameProps) {
  const { node, url, viewport, layout, sandboxPreset, sandboxValue, gatewaySnapshot, isInteract, picking, iframeDimmed, iframeRef, onSnapshotError, onLoad, onError } = props;
  return (
    <div
      className="page-node__iframe-shell"
      data-sandbox-preset={sandboxPreset}
      data-lam-iframe-shell
      style={{
        width: layout.contentWidth,
        height: layout.contentHeight,
      }}
    >
      {/* Под живым iframe — его снимок: во время зума iframe прячется (дорогой слой), виден снимок. */}
      {gatewaySnapshot === null ? null : (
        <img
          className="page-node__snapshot page-node__snapshot--under"
          src={gatewaySnapshot}
          alt=""
          aria-hidden={true}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={onSnapshotError}
          style={{ width: viewport.width, height: viewport.height, transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`, transformOrigin: '0 0' }}
        />
      )}
      <iframe
        ref={iframeRef}
        key={`${url}:${sandboxPreset}:${viewport.width}:${viewport.heightMode ?? 'auto'}`}
        title={node.title}
        src={url}
        {...{ [NODE_IFRAME_ATTR]: node.id }}
        width={viewport.width}
        height={viewport.height}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-read; clipboard-write"
        className={
          isInteract
            ? 'page-node__iframe page-node__iframe--interact nodrag nopan nowheel'
            : 'page-node__iframe nodrag nopan nowheel'
        }
        data-lam-interact={isInteract ? '1' : '0'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          border: 0,
          transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`,
          transformOrigin: '0 0',
          /* Только explicit «Клики в iframe» — hover/click доходят в app */
          pointerEvents: isInteract || picking ? 'auto' : 'none',
          zIndex: isInteract || picking ? 2 : 0,
          /* Warm keep-alive: DOM жив; чуть тусклее если не live-слот */
          opacity: iframeDimmed ? 0.92 : 1,
        }}
        sandbox={sandboxValue}
        onLoad={onLoad}
        onError={onError}
      />
    </div>
  );
}
