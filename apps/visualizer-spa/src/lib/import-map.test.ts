import { describe, expect, test } from 'bun:test';
import { importMapFile, importMapJson, importMapValue } from './import-map';

/** Минимальный валидный enterprise AppMapDocument. */
function makeEnterpriseDoc(): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test-import', version: '0.0.1' },
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
  };
}

/** Минимальный валидный liveappmap. */
function makeLiveDoc(): Record<string, unknown> {
  return {
    version: '1.0',
    baseUrl: 'http://localhost:5173',
    pages: [
      { id: 'home', title: 'Home', path: '/' },
      { id: 'feed', title: 'Feed', path: '/feed' },
    ],
    edges: [{ from: 'home', to: 'feed', kind: 'navigation' }],
  };
}

describe('importMapJson', () => {
  test('битый JSON → error string', () => {
    const result = importMapJson('{not-json');
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error).toMatch(/JSON/i);
  });

  test('валидный enterprise JSON → ok', () => {
    const result = importMapJson(JSON.stringify(makeEnterpriseDoc()));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.json).toBeTruthy();
  });

  test('валидный liveappmap JSON → ok', () => {
    const result = importMapJson(JSON.stringify(makeLiveDoc()));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.json).toBeTruthy();
  });

  test('объект без формата карты → error string', () => {
    const result = importMapJson(JSON.stringify({ not: 'a map' }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.error).toMatch(/разобрать/i);
  });
});

describe('importMapValue', () => {
  test('enterprise object → ok', () => {
    const result = importMapValue(makeEnterpriseDoc());
    expect(result.ok).toBe(true);
  });

  test('live object → ok', () => {
    const result = importMapValue(makeLiveDoc());
    expect(result.ok).toBe(true);
  });
});

describe('importMapFile', () => {
  test('zip invalid → error string', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = new File([garbage], 'broken.appmap', {
      type: 'application/zip',
    });
    const result = await importMapFile(file);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error).toMatch(/INVALID_ZIP|zip|архив/i);
  });

  test('валидный enterprise .json файл → ok', async () => {
    const text = JSON.stringify(makeEnterpriseDoc());
    const file = new File([text], 'map.json', { type: 'application/json' });
    const result = await importMapFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
  });

  test('валидный live .json файл → ok', async () => {
    const text = JSON.stringify(makeLiveDoc());
    const file = new File([text], 'live.liveappmap.json', {
      type: 'application/json',
    });
    const result = await importMapFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
  });
});
