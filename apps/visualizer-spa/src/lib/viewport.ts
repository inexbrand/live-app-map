/**
 * Пресеты и утилиты размера окна (адаптив live iframe).
 * Дефолт — 16:9. Единая math для RF style, outer DOM и iframe shell.
 */
import type { DeviceViewport } from '@live-app-map/schema';

export type ViewportPresetId =
  | 'map'
  | 'phone-sm'
  | 'phone'
  | 'tablet'
  | 'desktop'
  | 'custom';

export type ViewportPreset = {
  readonly id: ViewportPresetId;
  readonly label: string;
  readonly width: number;
  readonly height: number;
};

/** 16:9 — базовый aspect для превью на карте */
export const ASPECT_16_9 = 16 / 9;

/** Канонические пресеты (RU). «Карта» и «Десктоп» — 16:9. */
export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: 'map', label: '16:9', width: 640, height: 360 },
  { id: 'phone-sm', label: 'Телефон S', width: 375, height: 667 },
  { id: 'phone', label: 'Телефон', width: 390, height: 844 },
  { id: 'tablet', label: 'Планшет', width: 768, height: 1024 },
  { id: 'desktop', label: 'Десктоп', width: 1280, height: 720 },
] as const;

/** Дефолт: 16:9 (640×360). */
export const DEFAULT_VIEWPORT: DeviceViewport = {
  width: 640,
  height: 360,
  label: '16:9',
};

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
 * Нормализует viewport (clamp разумных границ).
 */
export function clampViewport(v: DeviceViewport): DeviceViewport {
  const width = Math.min(1920, Math.max(200, Math.round(v.width)));
  const height = Math.min(2400, Math.max(120, Math.round(v.height)));
  return {
    width,
    height,
    label: v.label,
  };
}

/**
 * Подгоняет height под 16:9 при известной width.
 */
export function fitTo16x9(width: number): DeviceViewport {
  const w = Math.min(1920, Math.max(200, Math.round(width)));
  const h = Math.round(w / ASPECT_16_9);
  return { width: w, height: h, label: '16:9' };
}

/**
 * Размер области превью (контент) после display scale.
 * body + iframe-shell = ровно эти width/height.
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
 * RF `style` width/height и root `.page-node` используют это.
 */
export function nodeOuterSize(
  viewport: DeviceViewport,
  displayScale: number,
  options?: { readonly selected?: boolean },
): { readonly width: number; readonly height: number } {
  const layout = computeNodeLayout(viewport, displayScale, options);
  return { width: layout.outerWidth, height: layout.outerHeight };
}

/**
 * Полная раскладка размеров одной page-node (единый источник правды).
 */
export type NodeLayoutMetrics = {
  readonly viewport: DeviceViewport;
  readonly displayScale: number;
  /** Область превью (body / iframe-shell) */
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly chromeHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  /** scale() для iframe: content/viewport */
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
 * Viewport из appmap node или дефолт 16:9.
 */
export function resolveNodeViewport(
  nodeViewport: DeviceViewport | undefined,
  override: DeviceViewport | undefined,
): DeviceViewport {
  if (override) {
    return clampViewport(override);
  }
  if (nodeViewport) {
    return clampViewport(nodeViewport);
  }
  return DEFAULT_VIEWPORT;
}

/**
 * Проверка: outer = content + chrome; shell fills content (equality).
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
