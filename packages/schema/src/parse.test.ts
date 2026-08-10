import { describe, expect, test } from 'bun:test';
import {
  parseLiveAppMapJson,
  parseLiveAppMapDocument,
  parseAppMapDocument,
} from './parse';
import { liveAppMapToAppMap, appMapToLiveAppMap } from './convert';

const sampleLive = {
  version: '1.0',
  baseUrl: 'http://localhost:5173',
  pages: [
    { id: 'home', title: 'Home', path: '/' },
    {
      id: 'feed',
      title: 'Feed',
      path: '/feed',
      states: [
        {
          name: 'recruiter',
          note: 'Роль рекрутера',
          inject: { role: 'recruiter', query: { lam_role: 'recruiter' } },
        },
        {
          name: 'employer',
          note: 'Роль клиента (employer)',
          inject: { role: 'employer', query: { lam_role: 'employer' } },
        },
      ],
    },
  ],
  edges: [{ from: 'home', to: 'feed', label: 'Open feed', kind: 'navigation' }],
};

/**
 * Минимальный валидный enterprise AppMapDocument (formatVersion 1).
 * @param overrides Переопределения полей верхнего уровня
 */
function makeEnterpriseDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.1' },
    revision: 'rev-test',
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5173',
    nodes: [
      { id: 'home', kind: 'page', title: 'Home', pathPattern: '/' },
      { id: 'feed', kind: 'page', title: 'Feed', pathPattern: '/feed' },
    ],
    edges: [
      {
        id: 'e-home-feed',
        from: 'home',
        to: 'feed',
        kind: 'link',
        confidence: 'high',
      },
    ],
    ...overrides,
  };
}

describe('parseLiveAppMapJson', () => {
  test('принимает валидный документ со states', () => {
    const result = parseLiveAppMapJson(JSON.stringify(sampleLive));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.pages).toHaveLength(2);
    const feed = result.document.pages.find((p) => p.id === 'feed');
    expect(feed?.states?.[0]?.inject?.role).toBe('recruiter');
  });

  test('отклоняет битый JSON', () => {
    const result = parseLiveAppMapJson('{');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe('INVALID_JSON');
    expect(result.errors[0]?.message.length).toBeGreaterThan(0);
  });
});

describe('parseLiveAppMapDocument', () => {
  test('major version > 1 → UNSUPPORTED_VERSION', () => {
    const result = parseLiveAppMapDocument({
      ...sampleLive,
      version: '2.0',
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
    expect(result.errors[0]?.message).toMatch(/2\.0|major/i);
  });

  test('numeric major version > 1 → UNSUPPORTED_VERSION', () => {
    const result = parseLiveAppMapDocument({
      ...sampleLive,
      version: 3,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.map((e) => e.code)).toContain('UNSUPPORTED_VERSION');
  });
});

describe('parseAppMapDocument', () => {
  test('валидный enterprise → ok без предупреждений', () => {
    const result = parseAppMapDocument(makeEnterpriseDoc());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.nodes).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  test('валидный enterprise с дубликатом node id → ok + DUPLICATE_NODE_ID', () => {
    const result = parseAppMapDocument(
      makeEnterpriseDoc({
        nodes: [
          { id: 'home', kind: 'page', title: 'Home', pathPattern: '/' },
          { id: 'home', kind: 'page', title: 'Home dup', pathPattern: '/home-dup' },
        ],
        edges: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('DUPLICATE_NODE_ID');
    expect(result.warnings.find((w) => w.code === 'DUPLICATE_NODE_ID')?.message).toMatch(
      /home/,
    );
  });

  test('валидный enterprise с dangling edge → ok + DANGLING_EDGE', () => {
    const result = parseAppMapDocument(
      makeEnterpriseDoc({
        nodes: [{ id: 'home', kind: 'page', title: 'Home', pathPattern: '/' }],
        edges: [
          {
            id: 'e-missing-to',
            from: 'home',
            to: 'ghost-page',
            kind: 'link',
            confidence: 'medium',
          },
          {
            id: 'e-missing-from',
            from: 'no-such-node',
            to: null,
            kind: 'redirect',
            confidence: 'low',
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const dangling = result.warnings.filter((w) => w.code === 'DANGLING_EDGE');
    expect(dangling.length).toBe(2);
    expect(dangling.some((w) => w.message.includes('to=ghost-page'))).toBe(true);
    expect(dangling.some((w) => w.message.includes('from=no-such-node'))).toBe(true);
  });

  test('валидный enterprise: DUPLICATE_NODE_ID + DANGLING_EDGE в одном документе', () => {
    const result = parseAppMapDocument(
      makeEnterpriseDoc({
        nodes: [
          { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
          { id: 'a', kind: 'page', title: 'A2', pathPattern: '/a2' },
        ],
        edges: [
          {
            id: 'e1',
            from: 'a',
            to: 'missing',
            kind: 'link',
            confidence: 'high',
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('DUPLICATE_NODE_ID');
    expect(codes).toContain('DANGLING_EDGE');
  });

  test('невалидная форма → ok:false + code/message', () => {
    const result = parseAppMapDocument({
      formatVersion: 1,
      kind: 'not-a-map',
      nodes: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.code).toBe('INVALID_APPMAP_DOCUMENT');
    expect(typeof result.errors[0]?.message).toBe('string');
    expect(result.errors[0]?.message.length).toBeGreaterThan(0);
  });

  test('полностью чужой input → ok:false + INVALID_APPMAP_DOCUMENT', () => {
    const result = parseAppMapDocument(null);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.every((e) => e.code === 'INVALID_APPMAP_DOCUMENT')).toBe(true);
    expect(result.errors.every((e) => e.severity === 'error')).toBe(true);
  });
});

describe('roundtrip convert', () => {
  test('live → appmap → live сохраняет pages и states', () => {
    const parsed = parseLiveAppMapJson(JSON.stringify(sampleLive));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const enterprise = liveAppMapToAppMap(parsed.document);
    const back = appMapToLiveAppMap(enterprise);
    expect(back.pages.map((p) => p.id).sort()).toEqual(['feed', 'home']);
    const feed = back.pages.find((p) => p.id === 'feed');
    expect(feed?.states?.some((s) => s.inject?.role === 'employer')).toBe(true);

    const reparse = parseAppMapDocument(enterprise);
    expect(reparse.ok).toBe(true);
  });
});
