/**
 * Next.js integration: withLiveAppMap + Devtools re-export.
 */
export { LiveAppMap, LiveAppMapDevtools } from '@live-app-map/react';

export type LiveAppMapNextOptions = {
  readonly enabled?: boolean;
  readonly allowProduction?: boolean;
  readonly routePrefix?: string;
};

/** Элемент rewrites Next.js (source → destination). */
type NextRewriteRule = {
  readonly source: string;
  readonly destination: string;
};

/** Фазовая форма rewrites (beforeFiles / afterFiles / fallback). */
type NextRewritePhases = {
  readonly beforeFiles?: readonly NextRewriteRule[];
  readonly afterFiles?: readonly NextRewriteRule[];
  readonly fallback?: readonly NextRewriteRule[];
};

/**
 * Сужает unknown rewrites к фазовой форме Next.
 */
function asRewritePhases(value: unknown): NextRewritePhases | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as NextRewritePhases;
}

/**
 * Оборачивает next.config — dev-only rewrite placeholder для /__live-app-map/*.
 */
export function withLiveAppMap(options: LiveAppMapNextOptions = {}) {
  const enabled =
    options.enabled ??
    (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');
  const allowProduction = options.allowProduction ?? false;
  const routePrefix = options.routePrefix ?? '/__live-app-map';

  return function wrap<T extends Record<string, unknown>>(nextConfig: T): T {
    if (!enabled && !allowProduction) {
      return nextConfig;
    }
    const rewrites = async (): Promise<
      readonly NextRewriteRule[] | NextRewritePhases
    > => {
      const rawRewrites = nextConfig['rewrites'];
      const userRewrites =
        typeof rawRewrites === 'function'
          ? await (
              rawRewrites as () => Promise<
                readonly NextRewriteRule[] | NextRewritePhases
              >
            )()
          : rawRewrites;
      const extra: NextRewriteRule[] = [
        {
          source: `${routePrefix}/:path*`,
          destination: `${routePrefix}/:path*`,
        },
      ];
      if (Array.isArray(userRewrites)) {
        return [...extra, ...(userRewrites as readonly NextRewriteRule[])];
      }
      const phases = asRewritePhases(userRewrites);
      if (phases) {
        return {
          ...phases,
          beforeFiles: [...extra, ...(phases.beforeFiles ?? [])],
        };
      }
      return extra;
    };
    const prevEnv =
      nextConfig['env'] !== null &&
      typeof nextConfig['env'] === 'object' &&
      !Array.isArray(nextConfig['env'])
        ? (nextConfig['env'] as Record<string, string>)
        : {};
    return {
      ...nextConfig,
      rewrites,
      env: {
        ...prevEnv,
        LIVE_APP_MAP_ENABLED: enabled || allowProduction ? '1' : '0',
      },
    };
  };
}
