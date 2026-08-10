import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import type { AppMapDocument } from '@live-app-map/schema';
import { exportAppMapZip, parseAppMapZip } from './index';

function sampleDoc(
  partial?: Partial<AppMapDocument> &
    Pick<Partial<AppMapDocument>, 'nodes' | 'edges'>,
): AppMapDocument {
  return {
    formatVersion: 1,
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
