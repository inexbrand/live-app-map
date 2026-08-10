/**
 * Next.js integration: withLiveAppMap + Devtools re-export.
 */
export { LiveAppMap, LiveAppMapDevtools } from '@live-app-map/react';

/** Опции обёртки next.config для Live App Map. */
export type LiveAppMapNextOptions = {
  readonly enabled?: boolean;
  readonly allowProduction?: boolean;
  /** Префикс маршрута в приложении (source rewrite). */
  readonly routePrefix?: string;
  /**
   * Базовый URL sidecar visualizer (destination rewrite).
   * По умолчанию http://127.0.0.1:4310.
   */
  readonly sidecarBaseUrl?: string;
  /**
   * Явно разрешить identity rewrite (source === destination).
   * Без флага silent no-op запрещён — только осмысленный sidecar/static target.
   */
  readonly allowIdentityRewrite?: boolean;
};

/** Элемент rewrites Next.js (source → destination). */
export type NextRewriteRule = {
  readonly source: string;
  readonly destination: string;
};

/** Фазовая форма rewrites (beforeFiles / afterFiles / fallback). */
export type NextRewritePhases = {
  readonly beforeFiles?: readonly NextRewriteRule[];
  readonly afterFiles?: readonly NextRewriteRule[];
  readonly fallback?: readonly NextRewriteRule[];
};

/** Результат rewrites: массив правил или фазовая форма Next. */
export type NextRewritesResult =
  | readonly NextRewriteRule[]
  | NextRewritePhases;

/** next.config после включения Live App Map. */
export type LiveAppMapWrappedConfig<T extends Record<string, unknown>> = T & {
  readonly rewrites: () => Promise<NextRewritesResult>;
  readonly env: Readonly<Record<string, string>>;
};

const DEFAULT_ROUTE_PREFIX = '/__live-app-map';
const DEFAULT_SIDECAR_BASE_URL = 'http://127.0.0.1:4310';

/**
 * Проверяет, что значение — одиночное правило rewrite.
 */
function isNextRewriteRule(value: unknown): value is NextRewriteRule {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (!('source' in value) || !('destination' in value)) {
    return false;
  }
  const source = value.source;
  const destination = value.destination;
  return typeof source === 'string' && typeof destination === 'string';
}

/**
 * Проверяет массив правил rewrite.
 */
function isNextRewriteRuleArray(
  value: unknown,
): value is readonly NextRewriteRule[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (!isNextRewriteRule(item)) {
      return false;
    }
  }
  return true;
}

/**
 * Сужает unknown rewrites к фазовой форме Next.
 */
function isNextRewritePhases(value: unknown): value is NextRewritePhases {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if ('beforeFiles' in value && value.beforeFiles !== undefined) {
    if (!isNextRewriteRuleArray(value.beforeFiles)) {
      return false;
    }
  }
  if ('afterFiles' in value && value.afterFiles !== undefined) {
    if (!isNextRewriteRuleArray(value.afterFiles)) {
      return false;
    }
  }
  if ('fallback' in value && value.fallback !== undefined) {
    if (!isNextRewriteRuleArray(value.fallback)) {
      return false;
    }
  }
  return true;
}

/**
 * Фабрика rewrites из next.config (sync или async).
 */
function isRewritesFactory(
  value: unknown,
): value is () => unknown | Promise<unknown> {
  return typeof value === 'function';
}

/**
 * Собирает string-env из unknown без lazy cast.
 */
function readEnvRecord(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[key] = entry;
    }
  }
  return out;
}

/**
 * Убирает завершающий `/` у base URL sidecar.
 */
function normalizeBaseUrl(baseUrl: string): string {
  if (baseUrl.length > 1 && baseUrl.endsWith('/')) {
    return baseUrl.slice(0, -1);
  }
  return baseUrl;
}

/**
 * Строит правило rewrite: app prefix → sidecar (или identity при explicit opt-in).
 * @throws Error если получился no-op без allowIdentityRewrite
 */
function buildLiveAppMapRewrite(
  routePrefix: string,
  sidecarBaseUrl: string,
  allowIdentityRewrite: boolean,
): NextRewriteRule {
  const source = `${routePrefix}/:path*`;
  let destination: string;

  if (allowIdentityRewrite) {
    destination = source;
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(
        '[live-app-map] allowIdentityRewrite=true: rewrite source===destination (no-op). ' +
          'Предпочтите sidecarBaseUrl → visualizer sidecar.',
      );
    }
  } else {
    destination = `${normalizeBaseUrl(sidecarBaseUrl)}/:path*`;
  }

  if (source === destination && !allowIdentityRewrite) {
    throw new Error(
      '[live-app-map] rewrite source===destination запрещён без allowIdentityRewrite. ' +
        'Задайте sidecarBaseUrl (по умолчанию http://127.0.0.1:4310) или allowIdentityRewrite: true.',
    );
  }

  return { source, destination };
}

/**
 * Резолвит user rewrites (функция / массив / фазы) через type guards.
 */
async function resolveUserRewrites(
  raw: unknown,
): Promise<NextRewritesResult | null> {
  const resolved: unknown = isRewritesFactory(raw)
    ? await Promise.resolve(raw())
    : raw;

  if (resolved === null || resolved === undefined) {
    return null;
  }
  if (isNextRewriteRuleArray(resolved)) {
    return resolved;
  }
  if (isNextRewritePhases(resolved)) {
    return resolved;
  }
  return null;
}

/**
 * Оборачивает next.config — dev rewrite `/__live-app-map/*` → sidecar visualizer.
 */
export function withLiveAppMap(options: LiveAppMapNextOptions = {}) {
  const enabled =
    options.enabled ??
    (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');
  const allowProduction = options.allowProduction ?? false;
  const routePrefix = options.routePrefix ?? DEFAULT_ROUTE_PREFIX;
  const sidecarBaseUrl = options.sidecarBaseUrl ?? DEFAULT_SIDECAR_BASE_URL;
  const allowIdentityRewrite = options.allowIdentityRewrite ?? false;

  return function wrap<T extends Record<string, unknown>>(
    nextConfig: T,
  ): T | LiveAppMapWrappedConfig<T> {
    if (!enabled && !allowProduction) {
      return nextConfig;
    }

    const extraRule = buildLiveAppMapRewrite(
      routePrefix,
      sidecarBaseUrl,
      allowIdentityRewrite,
    );
    const extra: readonly NextRewriteRule[] = [extraRule];

    const rewrites = async (): Promise<NextRewritesResult> => {
      const rawRewrites = nextConfig['rewrites'];
      const userRewrites = await resolveUserRewrites(rawRewrites);

      if (userRewrites !== null && isNextRewriteRuleArray(userRewrites)) {
        return [...extra, ...userRewrites];
      }
      if (userRewrites !== null && isNextRewritePhases(userRewrites)) {
        return {
          ...userRewrites,
          beforeFiles: [...extra, ...(userRewrites.beforeFiles ?? [])],
        };
      }
      return extra;
    };

    const prevEnv = readEnvRecord(nextConfig['env']);
    const mapEnabled = enabled || allowProduction;

    const wrapped: LiveAppMapWrappedConfig<T> = {
      ...nextConfig,
      rewrites,
      env: {
        ...prevEnv,
        LIVE_APP_MAP_ENABLED: mapEnabled ? '1' : '0',
      },
    };
    return wrapped;
  };
}
