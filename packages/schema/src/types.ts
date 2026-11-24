/**
 * Канонические типы Live App Map (formatVersion 2).
 * Совместимы с enterprise TDD и viewer-форматом liveappmap.
 * v2 = v1 + раздел `code` и нода `service`; v1 поднимается в `upgradeAppMapDocument`.
 */
import type { CodeModel } from './code-model';
import type { DocsModel } from './docs-model';
import type { ViewportHeightMode, DeviceViewport, MapViewportPreset, ConnectorScreenSize } from './viewport-types';
export type { ViewportHeightMode, DeviceViewport, MapViewportPreset, ConnectorScreenSize } from './viewport-types';
export { DEVICE_HEIGHT_FALLBACK } from './viewport-types';
export type { LiveAppMapPage, LiveAppMapEdge, LiveAppMapDocument } from './live-format';
export type { DiagnosticSeverity, SchemaDiagnosticCode, Diagnostic } from './diagnostic-types';
export { isSchemaDiagnosticCode, SCHEMA_DIAGNOSTIC_CODES } from './diagnostic-types';

/** Текущая версия enterprise-формата. */
export const FORMAT_VERSION: 2 = 2;

/** Версии enterprise-формата, которые читает parseAppMapDocument. */
export type SupportedFormatVersion = 1 | 2;

export type FrameworkKind = 'next' | 'react-router' | 'hybrid' | 'unknown' | 'manual';

export type NodeKind =
  | 'page'
  | 'layout'
  | 'route-handler'
  | 'intercept'
  | 'not-found'
  | 'external'
  | 'service'
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
  | 'back'
  /** Экран вызывает роуты сервиса (from — экран, to — нода сервиса). */
  | 'api';

export type Confidence = 'high' | 'medium' | 'low';

export type EdgeLayer = 'navigation' | 'structure' | 'composition';

/** Вид состояния экрана — для группировки и значка на карте. */
export type AppMapStateKind = 'data' | 'empty' | 'error' | 'loading' | 'ui';

/** Подмена ответа API в состоянии; 'pending' — ответ не приходит никогда (загрузка). */
export type AppMapApiOverride = { readonly status: number; readonly body?: unknown; readonly delayMs?: number } | 'pending';

/**
 * Шаг до кадра состояния: выполняет браузер трансляции после загрузки страницы.
 * Селекторы — Playwright (`text=Фильтры`, `role=button[name="Создать"]`, css). Совпадает с LamStep из sdk.
 */
export type AppMapStateStep =
  | { readonly click: string }
  | { readonly fill: string; readonly value: string }
  | { readonly press: string }
  | { readonly waitFor: string }
  | { readonly scroll: number };

/**
 * Состояние UI страницы. Старые карты: name + inject (роль, query) — переключатель на ноде.
 * Состояния по контракту sdk (LamScreenState: id, label, kind, role, api, steps) — отдельные
 * узлы рядом с экраном; у них name = id.
 */
export type AppMapPageState = {
  /** Ключ состояния на ноде; у состояния по контракту совпадает с id. */
  readonly name: string;
  /** id состояния по контракту: строчные латинские, цифры, дефис. */
  readonly id?: string;
  /** Подпись: «Пустая лента». */
  readonly label?: string;
  readonly kind?: AppMapStateKind;
  /** Роль входа (профиль шлюза); нет — роль экрана по умолчанию. */
  readonly role?: string;
  /** Подмена API: «МЕТОД /путь» → ответ. Выполняет рантайм sdk по ?lam_state. */
  readonly api?: Readonly<Record<string, AppMapApiOverride>>;
  readonly steps?: readonly AppMapStateStep[];
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
  /** Исходный код: сервисы, символы, роуты, БД (с formatVersion 2). */
  readonly code?: CodeModel;
  /** Документация проекта: эпохи задач, заметки, руководства. */
  readonly docs?: DocsModel;
};

/** Документ formatVersion 1 — как его писали сканеры до раздела `code`. */
export type AppMapDocumentV1 = Omit<AppMapDocument, 'formatVersion' | 'code' | 'docs'> & {
  readonly formatVersion: 1;
};
