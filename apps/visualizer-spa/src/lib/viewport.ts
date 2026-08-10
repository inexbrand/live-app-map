/**
 * Пресеты и утилиты размера окна (адаптив live iframe).
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

/** Канонические пресеты устройств (RU labels). */
export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: 'map', label: 'Карта', width: 320, height: 200 },
  { id: 'phone-sm', label: 'Телефон S', width: 375, height: 667 },
  { id: 'phone', label: 'Телефон', width: 390, height: 844 },
  { id: 'tablet', label: 'Планшет', width: 768, height: 1024 },
  { id: 'desktop', label: 'Десктоп', width: 1280, height: 800 },
] as const;

export const DEFAULT_VIEWPORT: DeviceViewport = {
  width: 320,
  height: 200,
  label: 'Карта',
};

/** Высота chrome ноды (header + path + states + resize bar). */
export const NODE_CHROME_H = 108;
export const NODE_PAD_X = 16;

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
 * Внешний размер ноды на карте (с учётом scale превью).
 */
export function nodeOuterSize(
  viewport: DeviceViewport,
  displayScale: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, Math.max(0.2, displayScale));
  return {
    width: Math.round(viewport.width * scale + NODE_PAD_X),
    height: Math.round(viewport.height * scale + NODE_CHROME_H),
  };
}

/**
 * Viewport из appmap node или дефолт.
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
