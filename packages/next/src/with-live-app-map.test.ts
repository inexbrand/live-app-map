import { afterEach, describe, expect, test } from 'bun:test';
import {
  withLiveAppMap,
  type LiveAppMapWrappedConfig,
  type NextRewritePhases,
  type NextRewriteRule,
  type NextRewritesResult,
} from './index';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

/**
 * Достаёт rewrites из обёрнутого config (когда map включён).
 */
async function getRewrites(
  config: Record<string, unknown> | LiveAppMapWrappedConfig<Record<string, unknown>>,
): Promise<NextRewritesResult> {
  if (!('rewrites' in config) || typeof config.rewrites !== 'function') {
    throw new Error('ожидалась функция rewrites');
  }
  return config.rewrites();
}

/**
 * Type guard: результат rewrites — массив правил (не фазы).
 */
function isRuleArrayResult(
  result: NextRewritesResult,
): result is readonly NextRewriteRule[] {
  return Array.isArray(result);
}

/**
 * Сужает результат rewrites к массиву правил.
 */
function asRuleArray(result: NextRewritesResult): readonly NextRewriteRule[] {
  if (!isRuleArrayResult(result)) {
    throw new Error('ожидался массив rewrites');
  }
  return result;
}

/**
 * Сужает результат rewrites к фазовой форме.
 */
function asPhases(result: NextRewritesResult): NextRewritePhases {
  if (isRuleArrayResult(result)) {
    throw new Error('ожидалась фазовая форма rewrites');
  }
  return result;
}

/**
 * Читает env из обёртки (map включён → LiveAppMapWrappedConfig).
 */
function readWrappedEnv(
  config: Record<string, unknown> | LiveAppMapWrappedConfig<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  if (
    !('env' in config) ||
    config.env === null ||
    typeof config.env !== 'object' ||
    Array.isArray(config.env)
  ) {
    throw new Error('ожидался env object');
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.env)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

describe('withLiveAppMap', () => {
  test('array rewrites: prepend sidecar rule and keep user rules', async () => {
    const wrap = withLiveAppMap({
      enabled: true,
      sidecarBaseUrl: 'http://127.0.0.1:4310',
    });
    const userRule: NextRewriteRule = {
      source: '/api/:path*',
      destination: '/proxy/:path*',
    };
    const wrapped = wrap({
      rewrites: async () => [userRule],
    });

    const rules = asRuleArray(await getRewrites(wrapped));
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      source: '/__live-app-map/:path*',
      destination: 'http://127.0.0.1:4310/:path*',
    });
    expect(rules[1]).toEqual(userRule);
    expect(rules[0]?.source).not.toBe(rules[0]?.destination);
  });

  test('object phases: inject into beforeFiles, preserve afterFiles', async () => {
    const wrap = withLiveAppMap({
      enabled: true,
      routePrefix: '/__lam',
      sidecarBaseUrl: 'http://localhost:4310',
    });
    const afterRule: NextRewriteRule = {
      source: '/docs/:path*',
      destination: '/static-docs/:path*',
    };
    const wrapped = wrap({
      rewrites: async (): Promise<NextRewritePhases> => ({
        beforeFiles: [
          { source: '/old', destination: '/new' },
        ],
        afterFiles: [afterRule],
      }),
    });

    const phases = asPhases(await getRewrites(wrapped));
    expect(phases.beforeFiles).toHaveLength(2);
    expect(phases.beforeFiles?.[0]).toEqual({
      source: '/__lam/:path*',
      destination: 'http://localhost:4310/:path*',
    });
    expect(phases.beforeFiles?.[1]).toEqual({
      source: '/old',
      destination: '/new',
    });
    expect(phases.afterFiles).toEqual([afterRule]);
  });

  test('enabled=false in production: returns config unchanged', () => {
    process.env.NODE_ENV = 'production';
    const wrap = withLiveAppMap({ enabled: false });
    const base = {
      rewrites: async (): Promise<NextRewriteRule[]> => [],
      env: { FOO: 'bar' },
    };
    const wrapped = wrap(base);
    expect(wrapped).toBe(base);
    expect(wrapped.env).toEqual({ FOO: 'bar' });
    expect(typeof wrapped.rewrites).toBe('function');
    expect('LIVE_APP_MAP_ENABLED' in wrapped.env).toBe(false);
  });

  test('LIVE_APP_MAP_ENABLED injected into env when map active', async () => {
    const wrap = withLiveAppMap({ enabled: true });
    const wrapped = wrap({
      env: { EXISTING: '1' },
    });
    const env = readWrappedEnv(wrapped);
    expect(env).toEqual({
      EXISTING: '1',
      LIVE_APP_MAP_ENABLED: '1',
    });
    const rules = asRuleArray(await getRewrites(wrapped));
    expect(rules.length).toBeGreaterThan(0);
  });

  test('allowProduction enables map even when enabled=false', async () => {
    process.env.NODE_ENV = 'production';
    const wrap = withLiveAppMap({ enabled: false, allowProduction: true });
    const wrapped = wrap({});
    expect(readWrappedEnv(wrapped)).toEqual({ LIVE_APP_MAP_ENABLED: '1' });
    const rules = asRuleArray(await getRewrites(wrapped));
    expect(rules[0]?.destination).toContain('127.0.0.1:4310');
  });

  test('allowIdentityRewrite: source===destination + diagnostic warn', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const wrap = withLiveAppMap({
        enabled: true,
        allowIdentityRewrite: true,
        routePrefix: '/__live-app-map',
      });
      const wrapped = wrap({});
      const rules = asRuleArray(await getRewrites(wrapped));
      expect(rules[0]?.source).toBe(rules[0]?.destination);
      expect(rules[0]?.source).toBe('/__live-app-map/:path*');
      expect(warnings.some((w) => w.includes('allowIdentityRewrite'))).toBe(
        true,
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  test('sync array rewrites function is supported', async () => {
    const wrap = withLiveAppMap({ enabled: true });
    const userRules: readonly NextRewriteRule[] = [
      { source: '/a', destination: '/b' },
    ];
    const wrapped = wrap({
      rewrites: () => userRules,
    });
    const rules = asRuleArray(await getRewrites(wrapped));
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({ source: '/a', destination: '/b' });
  });
});
