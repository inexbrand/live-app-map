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
  readonly algorithm?: string;
  readonly direction?: 'TB' | 'LR' | 'BT' | 'RL';
  readonly defaultViewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
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

export type Diagnostic = {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly file?: string;
  readonly hint?: string;
};
