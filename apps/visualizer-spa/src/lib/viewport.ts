/**
 * Пресеты и утилиты размера окна (адаптив live iframe).
 * Размер для layout — из map JSON (page.viewport / layout.defaultDeviceViewport).
 * Measure iframe только при явном heightMode=auto.
 */
import type { DeviceViewport, LayoutHints, ViewportHeightMode } from '@live-app-map/schema';

export type ViewportPresetId = string;

export type ViewportPreset = {
  readonly id: ViewportPresetId;
  readonly label: string;
  readonly width: number;
  /** Высота кадра (fixed dogfood) или fallback до measure (auto) */
  readonly height: number;
  readonly heightMode?: ViewportHeightMode;
};

/** 16:9 — только для fixed landscape helper */
export const ASPECT_16_9 = 16 / 9;

/**
 * Канонические брейкпоинты (JSON layout + UI).
 * heightMode fixed — размер layout без measure-on-render.
 */
export const BUILTIN_VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: 'w360', label: '360', width: 360, height: 800, heightMode: 'fixed' },
  { id: 'w390', label: '390', width: 390, height: 844, heightMode: 'fixed' },
  { id: 'w480', label: '480', width: 480, height: 900, heightMode: 'fixed' },
  { id: 'w768', label: '768', width: 768, height: 1024, heightMode: 'fixed' },
  { id: 'w1024', label: '1024', width: 1024, height: 900, heightMode: 'fixed' },
  { id: 'w1280', label: '1280', width: 1280, height: 800, heightMode: 'fixed' },
  { id: 'w1920', label: '1920', width: 1920, height: 1080, heightMode: 'fixed' },
];

/** @deprecated alias — UI/тесты; то же что BUILTIN */
export const VIEWPORT_PRESETS = BUILTIN_VIEWPORT_PRESETS;

/** Дефолт ширины, если layout/JSON молчат (mobile-first dogfood). */
export const DEFAULT_WIDTH = 390;

/** Fallback высоты (типичный phone frame). */
export const DEFAULT_HEIGHT_FALLBACK = 844;

/** Макс. измеренная высота контента (защита от runaway). */
export const MAX_CONTENT_HEIGHT = 50_000;

/** Дефолт dogfood: 390×844 fixed — без measure при рендере карты. */
export const DEFAULT_VIEWPORT: DeviceViewport = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT_FALLBACK,
  label: '390',
  heightMode: 'fixed',
};

/**
 * Нормализует viewport (clamp). heightMode auto допускает tall content.
 */
export function clampViewport(v: DeviceViewport): DeviceViewport {
  const width = Math.min(2560, Math.max(200, Math.round(v.width)));
  const height = Math.min(
    MAX_CONTENT_HEIGHT,
    Math.max(120, Math.round(v.height)),
  );
  const heightMode: ViewportHeightMode =
    v.heightMode === 'fixed' ? 'fixed' : 'auto';
  return {
    width,
    height,
    label: v.label,
    heightMode,
  };
}

/**
 * Подгоняет height под 16:9 при известной width (fixed helper).
 */
export function fitTo16x9(width: number): DeviceViewport {
  const w = Math.min(2560, Math.max(200, Math.round(width)));
  const h = Math.round(w / ASPECT_16_9);
  return { width: w, height: h, label: '16:9', heightMode: 'fixed' };
}

/**
 * Глобальный device viewport из layout JSON (если есть).
 */
export function resolveLayoutDeviceViewport(
  layout: LayoutHints | undefined,
): DeviceViewport | undefined {
  const ddv = layout?.defaultDeviceViewport;
  if (ddv !== undefined && typeof ddv.width === 'number') {
    return clampViewport({
      width: ddv.width,
      height:
        typeof ddv.height === 'number' && ddv.height >= 120
          ? ddv.height
          : DEFAULT_HEIGHT_FALLBACK,
      label: ddv.label,
      heightMode: ddv.heightMode === 'auto' ? 'auto' : 'fixed',
    });
  }
  return undefined;
}

/**
 * Дефолтная ширина из layout или константа.
 */
export function resolveDefaultWidth(layout: LayoutHints | undefined): number {
  return layoutSize(layout, 'width', layout?.defaultWidth, { min: 200, max: 2560, fallback: DEFAULT_WIDTH });
}

/** Размер из layout: устройство по умолчанию, иначе явное число в пределах, иначе запасное. */
function layoutSize(
  layout: LayoutHints | undefined,
  side: 'width' | 'height',
  value: unknown,
  limits: { readonly min: number; readonly max: number; readonly fallback: number },
): number {
  const fromDevice = resolveLayoutDeviceViewport(layout);
  if (fromDevice !== undefined) {
    return fromDevice[side];
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= limits.min) {
    return Math.min(limits.max, Math.round(value));
  }
  return limits.fallback;
}

/**
 * Fallback высоты из layout.
 */
export function resolveDefaultHeight(layout: LayoutHints | undefined): number {
  return layoutSize(layout, 'height', layout?.defaultHeight, { min: 120, max: MAX_CONTENT_HEIGHT, fallback: DEFAULT_HEIGHT_FALLBACK });
}

/**
 * heightMode: override → page → layout.defaultDeviceViewport → layout.defaultHeightMode → fixed.
 */
export function resolveHeightMode(
  nodeViewport: DeviceViewport | undefined,
  layout: LayoutHints | undefined,
  override?: DeviceViewport,
): ViewportHeightMode {
  const sources = [override?.heightMode, nodeViewport?.heightMode, resolveLayoutDeviceViewport(layout)?.heightMode, layout?.defaultHeightMode];
  return sources.find(isHeightMode) ?? 'fixed';
}

/** Режим высоты задан явно: fixed или auto. */
function isHeightMode(v: unknown): v is ViewportHeightMode {
  return v === 'fixed' || v === 'auto';
}

export type ResolveViewportArgs = {
  readonly nodeViewport?: DeviceViewport;
  readonly override?: DeviceViewport;
  readonly layout?: LayoutHints;
  /**
   * Измеренная высота document — **только** при heightMode=auto.
   * При fixed игнорируется (размер из JSON/layout).
   */
  readonly measuredHeight?: number;
};

/**
 * Итоговый viewport ноды.
 * Источник: override → page.viewport → layout.defaultDeviceViewport → defaultWidth/Height → constants.
 * Measure не участвует, пока heightMode !== 'auto'.
 */
export function resolveNodeViewport(args: ResolveViewportArgs = {}): DeviceViewport {
  const mapDevice = resolveLayoutDeviceViewport(args.layout);
  const heightMode = resolveHeightMode(args.nodeViewport, args.layout, args.override);
  const chain = [args.override, args.nodeViewport, mapDevice];
  const width = firstOf(chain, 'width') ?? resolveDefaultWidth(args.layout);
  const declared = firstOf(chain, 'height') ?? resolveDefaultHeight(args.layout);
  // fixed: never use measuredHeight
  const height = heightMode === 'auto' && isMeasured(args.measuredHeight) ? args.measuredHeight : declared;
  const label = firstOf(chain, 'label') ?? String(Math.round(width));
  return clampViewport({ width, height, label, heightMode });
}

/** Первое заданное значение поля по цепочке источников. */
function firstOf<K extends 'width' | 'height' | 'label'>(chain: readonly (DeviceViewport | undefined)[], key: K): DeviceViewport[K] | undefined {
  for (const v of chain) {
    const x = v?.[key];
    if (x !== undefined && x !== null) {
      return x;
    }
  }
  return undefined;
}

/** Измерение годится: конечное число не меньше 120 px. */
function isMeasured(h: number | undefined): h is number {
  return typeof h === 'number' && Number.isFinite(h) && h >= 120;
}

/**
 * Пишет глобальный adaptive viewport в layout (immutable merge).
 * Синхронизирует defaultDeviceViewport + defaultWidth/Height/Mode.
 */
export function applyMapDeviceViewport(
  layout: LayoutHints | undefined,
  device: DeviceViewport,
): LayoutHints {
  const clamped = clampViewport(device);
  const base = layout ?? {};
  return {
    ...base,
    defaultDeviceViewport: clamped,
    defaultWidth: clamped.width,
    defaultHeight: clamped.height,
    defaultHeightMode: clamped.heightMode ?? 'fixed',
  };
}

