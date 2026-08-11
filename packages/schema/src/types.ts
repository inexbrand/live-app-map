/**
 * Канонические типы Live App Map (formatVersion 1).
 * Совместимы с enterprise TDD и viewer-форматом liveappmap.
 */

export const FORMAT_VERSION = 1 as const;

export type FrameworkKind = 'next' | 'react-router' | 'hybrid' | 'unknown' | 'manual';

export type NodeKind =
  | 'page'
  | 'layout'
  | 'route-handler'
  | 'intercept'
  | 'not-found'
  | 'external'
  | 'unknown';

export type EdgeKind =
  | 'link'
  | 'push'
  | 'replace'
  | 'redirect'
  | 'middleware'
  | 'wraps'
  | 'parallel'
  | 'intercept'
  | 'parent'
  | 'unknown'
  | 'navigation'
  | 'deep-link'
  | 'back';

export type Confidence = 'high' | 'medium' | 'low';

export type EdgeLayer = 'navigation' | 'structure' | 'composition';

/** Состояние UI страницы (роли, empty, error, …) для инжекта при live-просмотре */
export type AppMapPageState = {
  readonly name: string;
  readonly url?: string;
  readonly screenshot?: string | null;
  readonly note?: string;
  /**
   * Инструкции инжекта: query, hash, localStorage, sessionStorage, cookie.
   * Применяется visualizer-ом перед загрузкой iframe.
   */
  readonly inject?: StateInjectSpec;
};

/** Как применить состояние к live iframe / новой вкладке */
export type StateInjectSpec = {
  readonly query?: Readonly<Record<string, string>>;
  readonly hash?: string;
  /** Ключи localStorage origin target (same-origin only) */
  readonly localStorage?: Readonly<Record<string, string>>;
  readonly sessionStorage?: Readonly<Record<string, string>>;
  /**
   * Роль продукта (Korbor miniapp: employer | recruiter).
   * Visualizer прокидывает через query `lam_role` и/или bridge.
   */
  readonly role?: string;
  /** Произвольные метки для UI */
  readonly labels?: readonly string[];
};

/**
 * Режим высоты превью:
 * - `auto` — visualizer измеряет scrollHeight контента iframe
 * - `fixed` — height из JSON / пресета
 */
export type ViewportHeightMode = 'auto' | 'fixed';

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

export type AppMapNode = {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly pathPattern: string;
  readonly pathExample?: string;
  readonly url?: string;
  readonly source?: { readonly file: string; readonly exportName?: string };
  readonly groupIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly dynamicParams?: readonly string[];
  readonly parallelSlot?: string | null;
  readonly intercept?: { readonly type: string; readonly targetPathPattern?: string } | null;
  readonly presentation?: 'page' | 'modal' | 'intercept' | 'slot';
  readonly iframePolicy?: {
    readonly enabled: boolean;
    readonly reason?: string;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly position?: { readonly x: number; readonly y: number };
  /**
   * Размер окна превью (адаптив). Ширина из JSON; heightMode auto → measure.
   * Если нет — layout.defaultWidth / layout.defaultHeightMode.
   */
  readonly viewport?: DeviceViewport;
  /**
   * Связующая нода (меню / hub): screen-space размер, видна на любом zoom.
   * Альтернатива: kind=layout, type=menu|nav|connector, metadata.connector=true.
   */
  readonly connector?: boolean;
  /** Именованные UI-состояния (роли, empty, …) */
  readonly states?: readonly AppMapPageState[];
  readonly defaultPinned?: boolean;
  readonly screenshot?: string | null;
};

export type AppMapEdge = {
  readonly id: string;
  readonly from: string;
  readonly to: string | null;
  readonly kind: EdgeKind;
  readonly confidence: Confidence;
  readonly label?: string;
  readonly raw?: string;
  readonly source?: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type AppMapGroup = {
  readonly id: string;
  readonly title: string;
  readonly color?: string;
  readonly order?: number;
};

export type LayoutHints = {
  /**
   * `row` — экраны в ряд (дефолт visualizer).
   * `dagre` — граф LR/TB.
   * Если у всех нод есть position — position побеждает.
   */
  readonly algorithm?: string;
  readonly direction?: 'TB' | 'LR' | 'BT' | 'RL';
  /**
   * Стартовая **камера** React Flow (x/y/zoom). Не путать с device viewport.
   * Редко; обычно fitView.
   */
  readonly defaultViewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  /**
   * Глобальный размер окна экранов карты (device viewport).
   * Применяется ко всем page без per-page `viewport`.
   * Предпочтительнее разрозненных defaultWidth/Height/Mode.
   */
  readonly defaultDeviceViewport?: DeviceViewport;
  /** Дефолтная ширина превью экрана (px), если у page нет viewport.width */
  readonly defaultWidth?: number;
  /** Fallback высоты до measure / при fixed без height */
  readonly defaultHeight?: number;
  /**
   * Дефолт heightMode для page без viewport.heightMode.
   * Dogfood: `fixed` (размер из JSON, без measure-on-render).
   */
  readonly defaultHeightMode?: ViewportHeightMode;
  /** Зазор между нодами в row-layout (world px до display scale) */
  readonly nodeGap?: number;
  /** Пресеты брейкпоинтов (360 / 480 / …) — UI + JSON */
  readonly viewportPresets?: readonly MapViewportPreset[];
  /** Screen-space clamp для связующих нод (menu / connector) */
  readonly connector?: ConnectorScreenSize;
};

export type GeneratorMeta = {
  readonly name: string;
  readonly version: string;
};

export type ProjectMeta = {
  readonly name?: string;
  readonly root: string;
  readonly framework: FrameworkKind;
  readonly next?: {
    readonly router: 'app' | 'pages' | 'hybrid';
    readonly basePath?: string;
    readonly monorepo?: boolean;
  };
};

export type AppMapDocument = {
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly kind: 'live-app-map';
  readonly generatedAt: string;
  readonly generator: GeneratorMeta;
  readonly revision: string;
  readonly project: ProjectMeta;
  readonly baseUrl: string | null;
  readonly nodes: readonly AppMapNode[];
  readonly edges: readonly AppMapEdge[];
  readonly groups?: readonly AppMapGroup[];
  readonly layout?: LayoutHints;
  readonly extensions?: Readonly<Record<string, unknown>>;
};

/** Viewer-формат liveappmap (docs/live-app-map-design.md) */
export type LiveAppMapPage = {
  readonly id: string;
  readonly title: string;
  readonly path?: string;
  readonly url?: string;
  readonly group?: string;
  readonly type?: string;
  readonly states?: readonly AppMapPageState[];
  readonly screenshot?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly position?: { readonly x: number; readonly y: number };
  /**
   * Размер окна: width обязателен; height опционален при heightMode=auto.
   * (enterprise DeviceViewport после convert всегда с height).
   */
  readonly viewport?: {
    readonly width: number;
    readonly height?: number;
    readonly label?: string;
    readonly heightMode?: ViewportHeightMode;
  };
  /** Связующая нода (меню / hub) — screen-space */
  readonly connector?: boolean;
  readonly iframeDisabled?: boolean;
  readonly defaultPinned?: boolean;
};

export type LiveAppMapEdge = {
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind?: string;
  readonly raw?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type LiveAppMapDocument = {
  readonly version: string | number;
  readonly app?: {
    readonly name?: string;
    readonly description?: string;
    readonly platform?: string;
    readonly generatedAt?: string;
    readonly generator?: string;
  };
  readonly baseUrl?: string;
  readonly pages: readonly LiveAppMapPage[];
  readonly edges: readonly LiveAppMapEdge[];
  readonly groups?: readonly AppMapGroup[];
  readonly layout?: LayoutHints;
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Коды, которые emit-ит сам `@live-app-map/schema` (parse / boundary).
 *
 * ## Split: SchemaDiagnosticCode vs DiagnosticCode
 *
 * | Слой | Где живёт | Назначение |
 * |------|-----------|------------|
 * | Wire `Diagnostic` | этот пакет (`code: string`) | единый value-object для CLI/SPA/scanners |
 * | `SchemaDiagnosticCode` | этот пакет | parse/convert boundary (Zod, JSON, graph-warnings) |
 * | `DiagnosticCode` | `@live-app-map/diagnostics` | закрытый scan-каталог + RU titles/`diag()` |
 *
 * **Почему не union в schema:** diagnostics зависит от schema (`import type { Diagnostic }`).
 * Re-export `DiagnosticCode` сюда создал бы cycle. Закрытый scan-каталог —
 * single source of truth в `@live-app-map/diagnostics`; schema-коды — здесь.
 * Пересечения (`DUPLICATE_NODE_ID`, `DANGLING_EDGE`) намеренные: один wire-тип,
 * два источника эмиссии (parse vs scan/normalize).
 */
export type SchemaDiagnosticCode =
  | 'INVALID_APPMAP_DOCUMENT'
  | 'INVALID_LIVEAPPMAP'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_PAGE_ID'
  | 'DANGLING_EDGE'
  | 'NO_URL';

/**
 * Runtime-список schema-кодов (для CLI/тестов/guard-ов).
 * Не путать с `getCatalog()` из `@live-app-map/diagnostics`.
 */
export const SCHEMA_DIAGNOSTIC_CODES: readonly SchemaDiagnosticCode[] = [
  'INVALID_APPMAP_DOCUMENT',
  'INVALID_LIVEAPPMAP',
  'INVALID_JSON',
  'UNSUPPORTED_VERSION',
  'DUPLICATE_NODE_ID',
  'DUPLICATE_PAGE_ID',
  'DANGLING_EDGE',
  'NO_URL',
] as const;

/**
 * Канонический wire-тип diagnostic (schema + scanners + CLI + SPA).
 *
 * `code` — открытая `string`: schema-коды (`SchemaDiagnosticCode`), scan-коды
 * (`DiagnosticCode` из `@live-app-map/diagnostics`) и plugin/future codes.
 * Не сужаем до union — иначе diagnostics/plugins не смогут расширять без bump schema.
 */
export type Diagnostic = {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly file?: string;
  readonly hint?: string;
};

/**
 * Type guard: код — известный schema boundary diagnostic.
 *
 * @param code - произвольная строка diagnostic.code
 * @returns true, если code ∈ SchemaDiagnosticCode
 */
export function isSchemaDiagnosticCode(code: string): code is SchemaDiagnosticCode {
  return (SCHEMA_DIAGNOSTIC_CODES as readonly string[]).includes(code);
}
