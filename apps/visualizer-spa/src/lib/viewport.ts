/**
 * Пресеты и утилиты размера окна (адаптив live iframe).
 * Размер для layout — из map JSON (page.viewport / layout.defaultDeviceViewport).
 * Measure iframe только при явном heightMode=auto.
 */
import type {
  AppMapNode,
  DeviceViewport,
  LayoutHints,
  MapViewportPreset,
  ViewportHeightMode,
} from '@live-app-map/schema';

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
] as const;

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
 * Пресеты: builtin + overlay из layout JSON (по id).
 * Неполный JSON (без w1024) **не** прячет builtin — UI adaptive всегда полный.
 */
export function resolveViewportPresets(
  layout: LayoutHints | undefined,
): readonly ViewportPreset[] {
  const fromJson = layout?.viewportPresets;
  if (fromJson === undefined || fromJson.length === 0) {
    return BUILTIN_VIEWPORT_PRESETS;
  }

  const byId = new Map<string, ViewportPreset>();
  for (const p of BUILTIN_VIEWPORT_PRESETS) {
    byId.set(p.id, p);
  }
  for (const p of fromJson) {
    byId.set(p.id, {
      id: p.id,
      label: p.label,
      width: p.width,
      height: p.height ?? DEFAULT_HEIGHT_FALLBACK,
      heightMode: p.heightMode ?? 'fixed',
    });
  }

  const order: string[] = BUILTIN_VIEWPORT_PRESETS.map((p) => p.id);
  for (const p of fromJson) {
    if (!order.includes(p.id)) {
      order.push(p.id);
    }
  }

  const out: ViewportPreset[] = [];
  for (const id of order) {
    const preset = byId.get(id);
    if (preset !== undefined) {
      out.push(preset);
    }
  }
  return out;
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
  const fromDevice = resolveLayoutDeviceViewport(layout);
  if (fromDevice !== undefined) {
    return fromDevice.width;
  }
  const w = layout?.defaultWidth;
  if (typeof w === 'number' && Number.isFinite(w) && w >= 200) {
    return Math.min(2560, Math.round(w));
  }
  return DEFAULT_WIDTH;
}

/**
 * Fallback высоты из layout.
 */
export function resolveDefaultHeight(layout: LayoutHints | undefined): number {
  const fromDevice = resolveLayoutDeviceViewport(layout);
  if (fromDevice !== undefined) {
    return fromDevice.height;
  }
  const h = layout?.defaultHeight;
  if (typeof h === 'number' && Number.isFinite(h) && h >= 120) {
    return Math.min(MAX_CONTENT_HEIGHT, Math.round(h));
  }
  return DEFAULT_HEIGHT_FALLBACK;
}

/**
 * heightMode: override → page → layout.defaultDeviceViewport → layout.defaultHeightMode → fixed.
 */
export function resolveHeightMode(
  nodeViewport: DeviceViewport | undefined,
  layout: LayoutHints | undefined,
  override?: DeviceViewport,
): ViewportHeightMode {
  if (override?.heightMode === 'fixed' || override?.heightMode === 'auto') {
    return override.heightMode;
  }
  if (
    nodeViewport?.heightMode === 'fixed' ||
    nodeViewport?.heightMode === 'auto'
  ) {
    return nodeViewport.heightMode;
  }
  const mapDevice = resolveLayoutDeviceViewport(layout);
  if (mapDevice?.heightMode === 'fixed' || mapDevice?.heightMode === 'auto') {
    return mapDevice.heightMode;
  }
  if (
    layout?.defaultHeightMode === 'fixed' ||
    layout?.defaultHeightMode === 'auto'
  ) {
    return layout.defaultHeightMode;
  }
  return 'fixed';
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
  const heightMode = resolveHeightMode(
    args.nodeViewport,
    args.layout,
    args.override,
  );
  const defaultW = resolveDefaultWidth(args.layout);
  const defaultH = resolveDefaultHeight(args.layout);

  const width =
    args.override?.width ??
    args.nodeViewport?.width ??
    mapDevice?.width ??
    defaultW;

  let height: number;
  if (heightMode === 'auto') {
    if (
      typeof args.measuredHeight === 'number' &&
      Number.isFinite(args.measuredHeight) &&
      args.measuredHeight >= 120
    ) {
      height = args.measuredHeight;
    } else {
      height =
        args.override?.height ??
        args.nodeViewport?.height ??
        mapDevice?.height ??
        defaultH;
    }
  } else {
    // fixed: never use measuredHeight
    height =
      args.override?.height ??
      args.nodeViewport?.height ??
      mapDevice?.height ??
      defaultH;
  }

  const label =
    args.override?.label ??
    args.nodeViewport?.label ??
    mapDevice?.label ??
    String(Math.round(width));

  return clampViewport({
    width,
    height,
    label,
    heightMode,
  });
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

/**
 * Собрать DeviceViewport из id builtin/layout preset.
 */
export function viewportFromPresetId(
  presetId: string,
  layout: LayoutHints | undefined,
): DeviceViewport | null {
  const presets = resolveViewportPresets(layout);
  const p = presets.find((x) => x.id === presetId);
  if (p === undefined) {
    return null;
  }
  return clampViewport({
    width: p.width,
    height: p.height,
    label: p.label,
    heightMode: p.heightMode ?? 'fixed',
  });
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
  if (node.connector === true) {
    return true;
  }
  if (node.kind === 'layout') {
    return true;
  }
  const meta = node.metadata;
  if (meta !== undefined && meta['connector'] === true) {
    return true;
  }
  const tags = node.tags;
  if (tags !== undefined) {
    for (const t of tags) {
      if (t === 'menu' || t === 'nav' || t === 'connector') {
        return true;
      }
    }
  }
  return false;
}

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
