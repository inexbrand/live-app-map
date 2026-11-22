/**
 * Размер ноды на холсте: рамка вокруг окна экрана, масштаб, коннекторы.
 */
import type { AppMapNode, DeviceViewport } from '@live-app-map/schema';
import { clampViewport } from './viewport';

/**
 * Chrome ноды (header + path + margins).
 * Должен совпадать с фактическим DOM (min-heights + padding).
 */
export const NODE_CHROME_H = 72;
/** Горизонтальные поля body (padding card). */
export const NODE_PAD_X = 16;
/** Панель пресетов, когда нода выбрана */
export const NODE_SELECTED_BAR_H = 36;
/** Запас под states-chips, если не selected */
export const NODE_STATES_BAR_H = 0;


/**
 * Размер области превью (контент) после display scale.
 */
export function contentDisplaySize(
  viewport: DeviceViewport,
  displayScale: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, Math.max(0.2, displayScale));
  return {
    width: Math.max(1, Math.round(viewport.width * scale)),
    height: Math.max(1, Math.round(viewport.height * scale)),
  };
}

/**
 * Внешний размер ноды на карте (content + chrome).
 */
export function nodeOuterSize(
  viewport: DeviceViewport,
  displayScale: number,
  options?: { readonly selected?: boolean },
): { readonly width: number; readonly height: number } {
  const layout = computeNodeLayout(viewport, displayScale, options);
  return { width: layout.outerWidth, height: layout.outerHeight };
}

export type NodeLayoutMetrics = {
  readonly viewport: DeviceViewport;
  readonly displayScale: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly chromeHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly iframeScaleX: number;
  readonly iframeScaleY: number;
};

/**
 * Считает согласованные размеры outer / content / iframe scale.
 */
export function computeNodeLayout(
  viewportInput: DeviceViewport,
  displayScale: number,
  options?: { readonly selected?: boolean },
): NodeLayoutMetrics {
  const viewport = clampViewport(viewportInput);
  const scale = Math.min(1, Math.max(0.2, displayScale));
  const content = contentDisplaySize(viewport, scale);
  const chromeHeight =
    NODE_CHROME_H + (options?.selected === true ? NODE_SELECTED_BAR_H : 0);
  return {
    viewport,
    displayScale: scale,
    contentWidth: content.width,
    contentHeight: content.height,
    chromeHeight,
    outerWidth: content.width + NODE_PAD_X,
    outerHeight: content.height + chromeHeight,
    iframeScaleX: content.width / viewport.width,
    iframeScaleY: content.height / viewport.height,
  };
}

/**
 * Связующая нода: menu / nav / connector / kind layout + flag.
 */
export function isConnectorNode(node: AppMapNode): boolean {
  if (node.connector === true || node.kind === 'layout') {
    return true;
  }
  return node.metadata?.['connector'] === true || (node.tags ?? []).some((t) => CONNECTOR_TAGS.has(t));
}

const CONNECTOR_TAGS = new Set(['menu', 'nav', 'connector']);

/**
 * World-size связующей ноды из screen px и zoom (постоянный размер на экране).
 */
export function connectorWorldSize(args: {
  readonly zoom: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly maxScreenWidth: number;
  readonly maxScreenHeight: number;
  readonly minScreenWidth: number;
  readonly minScreenHeight: number;
}): { readonly width: number; readonly height: number } {
  const z = Number.isFinite(args.zoom) && args.zoom > 0.01 ? args.zoom : 1;
  const sw = Math.min(
    args.maxScreenWidth,
    Math.max(args.minScreenWidth, args.screenWidth),
  );
  const sh = Math.min(
    args.maxScreenHeight,
    Math.max(args.minScreenHeight, args.screenHeight),
  );
  return {
    width: Math.max(8, sw / z),
    height: Math.max(8, sh / z),
  };
}

/**
 * Проверка: outer = content + chrome; shell fills content.
 */
export function assertShellConsistency(layout: NodeLayoutMetrics): boolean {
  const outerOk =
    layout.outerWidth === layout.contentWidth + NODE_PAD_X &&
    layout.outerHeight === layout.contentHeight + layout.chromeHeight;
  const scaleOk =
    Math.abs(layout.iframeScaleX * layout.viewport.width - layout.contentWidth) <
      1.5 &&
    Math.abs(layout.iframeScaleY * layout.viewport.height - layout.contentHeight) <
      1.5;
  return outerOk && scaleOk;
}
