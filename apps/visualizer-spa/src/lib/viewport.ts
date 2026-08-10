/**
 * Пресеты и утилиты размера окна (адаптив live iframe).
 * Дефолт и «Карта» — 16:9.
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

/** Дефолт: 16:9 (640×360) — удобно на карте. */
export const DEFAULT_VIEWPORT: DeviceViewport = {
  width: 640,
  height: 360,
  label: '16:9',
};

/** Высота chrome ноды (header + path + footer bar). */
export const NODE_CHROME_H = 96;
export const NODE_PAD_X = 16;
/** Доп. высота панели пресетов, когда нода выбрана */
export const NODE_SELECTED_BAR_H = 32;

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
  const content = contentDisplaySize(viewport, displayScale);
  const chrome =
    NODE_CHROME_H + (options?.selected === true ? NODE_SELECTED_BAR_H : 0);
  return {
    width: content.width + NODE_PAD_X,
    height: content.height + chrome,
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
