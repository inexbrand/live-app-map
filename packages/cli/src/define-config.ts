/**
 * Typed defineConfig для live-app-map.config.ts
 */
import type { ExampleParamsConfig, FrameworkKind } from '@live-app-map/scanner-core';

export type LiveAppMapConfig = {
  readonly baseUrl?: string;
  readonly exampleParams?: ExampleParamsConfig;
  readonly includeRouteHandlers?: boolean;
  readonly framework?: FrameworkKind | 'auto';
  readonly edge?: {
    readonly includeLowConfidence?: boolean;
    readonly maxFiles?: number;
  };
  readonly iframe?: {
    readonly maxLiveIframes?: number;
    readonly maxPinned?: number;
    readonly freezeStrategy?: 'unmount' | 'blank' | 'hybrid';
  };
  readonly ignore?: readonly string[];
  readonly monorepo?: {
    readonly filter?: string;
  };
  readonly route?: string;
};

/**
 * Хелпер конфига (identity + типы).
 */
export function defineConfig(config: LiveAppMapConfig): LiveAppMapConfig {
  return config;
}
