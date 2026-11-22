/**
 * Viewer-формат liveappmap: страницы, рёбра и документ.
 */
import type { CodeModel } from './code-model';
import type { DocsModel } from './docs-model';
import type { AppMapGroup, AppMapPageState, LayoutHints } from './types';
import type { ViewportHeightMode } from './viewport-types';

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
  /** Исходный код (переносится из enterprise-документа как есть). */
  readonly code?: CodeModel;
  /** Документация проекта (переносится как есть). */
  readonly docs?: DocsModel;
};
