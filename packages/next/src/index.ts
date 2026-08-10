/**
 * Next.js integration: withLiveAppMap + Devtools re-export.
 */
export { LiveAppMap, LiveAppMapDevtools } from '@live-app-map/react';

export type LiveAppMapNextOptions = {
  readonly enabled?: boolean;
  readonly allowProduction?: boolean;
  readonly routePrefix?: string;
};

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
    const rewrites = async () => {
      const userRewrites =
        typeof nextConfig['rewrites'] === 'function'
          ? await (nextConfig['rewrites'] as () => Promise<unknown>)()
          : nextConfig['rewrites'];
      const extra = [
        {
          source: `${routePrefix}/:path*`,
          destination: `${routePrefix}/:path*`,
        },
      ];
      if (Array.isArray(userRewrites)) {
        return [...extra, ...userRewrites];
      }
      if (userRewrites && typeof userRewrites === 'object') {
        const u = userRewrites as {
          beforeFiles?: unknown[];
          afterFiles?: unknown[];
          fallback?: unknown[];
        };
        return {
          ...u,
          beforeFiles: [...extra, ...(u.beforeFiles ?? [])],
        };
      }
      return extra;
    };
    return {
      ...nextConfig,
      rewrites,
      env: {
        ...((nextConfig['env'] as Record<string, string> | undefined) ?? {}),
        LIVE_APP_MAP_ENABLED: enabled || allowProduction ? '1' : '0',
      },
    } as T;
  };
}
