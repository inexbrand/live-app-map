import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import type { AppMapDocument } from '@live-app-map/schema';
import { exportAppMapZip, parseAppMapZip } from './index';

function sampleDoc(
  partial?: Partial<AppMapDocument> &
    Pick<Partial<AppMapDocument>, 'nodes' | 'edges'>,
): AppMapDocument {
  return {
    formatVersion: 2,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test-export', version: '0.1.0' },
    revision: 'r1',
    project: { name: 'fixture-app', root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5175',
    nodes: [
      { id: 'home', kind: 'page', title: 'Home', pathPattern: '/', pathExample: '/' },
      {
        id: 'settings',
        kind: 'page',
        title: 'Settings',
        pathPattern: '/settings',
        pathExample: '/settings',
        presentation: 'modal',
      },
    ],
    edges: [
      {
        id: 'e-home-settings',
        from: 'home',
        to: 'settings',
        kind: 'link',
        confidence: 'high',
        raw: 'href=/settings',
      },
    ],
    ...partial,
  };
}

describe('parseAppMapZip errors', () => {
  test('bad zip → INVALID_ZIP', async () => {
    const garbage = new TextEncoder().encode('not-a-zip-at-all');
    const result = await parseAppMapZip(garbage);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/^INVALID_ZIP:/);
  });

  test('zip without map.json → MISSING_MAP_JSON', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'no map here');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await parseAppMapZip(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.errors).toContain('MISSING_MAP_JSON');
  });

  test('invalid map.json → INVALID_JSON with message', async () => {
    const zip = new JSZip();
    zip.file('map.json', '{not-json');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await parseAppMapZip(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.errors[0]).toMatch(/^INVALID_JSON: map\.json/);
  });

  test('unreadable manifest → MANIFEST_UNREADABLE warning, still ok', async () => {
    const zip = new JSZip();
    zip.file(
      'map.json',
      JSON.stringify({
        nodes: [{ id: 'a', title: 'A', urlPath: '/a' }],
        edges: [],
      }),
    );
    zip.file('manifest.json', '{broken');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await parseAppMapZip(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.warnings.some((w) => w.startsWith('MANIFEST_UNREADABLE:'))).toBe(
      true,
    );
    expect(result.document.pages.length).toBe(1);
  });
});

describe('exportAppMapZip ↔ parseAppMapZip', () => {
  test('roundtrip preserves pages count', async () => {
    const doc = sampleDoc();
    const zipBytes = await exportAppMapZip(doc);
    expect(zipBytes.byteLength).toBeGreaterThan(0);

    const parsed = await parseAppMapZip(zipBytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(`parse failed: ${parsed.errors.join('; ')}`);
    }

    const livePageCount = doc.nodes.filter(
      (n) => n.kind === 'page' || n.kind === 'not-found' || n.kind === 'external',
    ).length;
    expect(parsed.document.pages.length).toBe(livePageCount);
    expect(parsed.document.pages.map((p) => p.id).sort()).toEqual(
      ['home', 'settings'].sort(),
    );
    expect(parsed.warnings.some((w) => w.startsWith('MANIFEST_MISSING:'))).toBe(
      false,
    );
  });

  test('roundtrip keeps edge from/to', async () => {
    const zipBytes = await exportAppMapZip(sampleDoc());
    const parsed = await parseAppMapZip(zipBytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(`parse failed: ${parsed.errors.join('; ')}`);
    }
    expect(parsed.document.edges.length).toBe(1);
    expect(parsed.document.edges[0]?.from).toBe('home');
    expect(parsed.document.edges[0]?.to).toBe('settings');
  });
});

describe('parseAppMapZip: manifest, снимки и liveappmap', () => {
  test('без manifest — предупреждение; снимок экрана берётся из screens/<slug>.png, иначе из capture', async () => {
    const zip = new JSZip();
    zip.file(
      'map.json',
      JSON.stringify({
        nodes: [
          { id: 'home', slug: 'home', title: 'Home', urlPath: '/' },
          { id: 'feed', title: 'Feed', urlPath: '/feed', capture: { screenshot: 'shots/feed.png' } },
          { slug: 'about', urlPath: '/about', capture: { screenshot: '' } },
        ],
      }),
    );
    zip.file('screens/home.png', new Uint8Array([1, 2, 3]));
    zip.folder('screens/sub');
    const result = await parseAppMapZip(await zip.generateAsync({ type: 'uint8array' }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.warnings).toEqual(['MANIFEST_MISSING: manifest.json отсутствует']);
    expect([...result.screens.keys()]).toEqual(['home.png']);
    expect(result.document.pages.map((p) => [p.id, p.title, p.screenshot])).toEqual([
      ['home', 'Home', 'screens/home.png'],
      ['feed', 'Feed', 'shots/feed.png'],
      ['about', 'about', null],
    ]);
  });

  test('map.json в формате liveappmap принимается как есть; ни то ни другое — INVALID_MAP', async () => {
    const live = new JSZip();
    live.file('map.json', JSON.stringify({ version: '1.0', pages: [{ id: 'a', title: 'A', path: '/a' }], edges: [] }));
    live.file('manifest.json', JSON.stringify({ formatVersion: 2 }));
    const ok = await parseAppMapZip(await live.generateAsync({ type: 'uint8array' }));
    expect(ok.ok && ok.document.pages.map((p) => p.id)).toEqual(['a']);
    const bad = new JSZip();
    bad.file('map.json', JSON.stringify({ что: 'то' }));
    const no = await parseAppMapZip(await bad.generateAsync({ type: 'uint8array' }));
    expect(no.ok ? [] : no.errors).toEqual(['INVALID_MAP: map.json без nodes[] и не liveappmap']);
  });
});
