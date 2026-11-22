/**
 * Размер окна экрана: режим высоты, окно устройства, пресеты адаптива, размер экрана коннектора.
 */


/**
 * Режим высоты превью:
 * - `auto` — visualizer измеряет scrollHeight контента iframe
 * - `fixed` — height из JSON / пресета
 */
export type ViewportHeightMode = 'auto' | 'fixed';

/**
 * Высота кадра, когда ни страница, ни layout её не задали (типичный телефон).
 * Значение временное: такой viewport помечается heightMode=auto и
 * переизмеряется visualizer-ом по контенту iframe.
 */
export const DEVICE_HEIGHT_FALLBACK = 844;

/**
 * Размер «окна» устройства для live iframe (адаптив).
 * CSS px логического viewport; visualizer может масштабировать для карты.
 * Ширина задаётся в JSON; высота при heightMode=auto — из контента.
 */
export type DeviceViewport = {
  readonly width: number;
  /** Логическая высота iframe; при auto — fallback до measure / после measure */
  readonly height: number;
  /** Подпись пресета: 360 / phone / tablet / desktop / custom */
  readonly label?: string;
  /**
   * auto — высота по measure iframe (явный opt-in).
   * fixed (dogfood default) — height только из JSON / layout, без measure.
   */
  readonly heightMode?: ViewportHeightMode;
};

/**
 * Пресет ширины (брейкпоинт адаптивки) в layout JSON карты.
 * height опционален: без него / heightMode auto → measure.
 */
export type MapViewportPreset = {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height?: number;
  readonly heightMode?: ViewportHeightMode;
};

/**
 * Настройки screen-space размера связующих нод (меню, hub).
 * Размер в CSS px на экране (не в world), clamp по max*.
 */
export type ConnectorScreenSize = {
  /** Базовая ширина на экране (px) */
  readonly screenWidth?: number;
  readonly screenHeight?: number;
  readonly maxScreenWidth?: number;
  readonly maxScreenHeight?: number;
  readonly minScreenWidth?: number;
  readonly minScreenHeight?: number;
};
