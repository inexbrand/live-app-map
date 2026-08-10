import { describe, expect, test } from 'bun:test';
import type { AppMapDocument } from '@live-app-map/schema';
import {
  applyStateToUrl,
  diffDocuments,
  indexDocument,
  neighbors,
  resolveNodeUrl,
  searchNodes,
} from './index';

function doc(partial: Partial<AppMapDocument> & Pick<AppMapDocument, 'nodes' | 'edges'>): AppMapDocument {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r1',
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5175',
    ...partial,
  };
}

describe('indexDocument', () => {
  test('adjacency in/out', () => {
    const g = indexDocument(
      doc({
        nodes: [
          { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
          { id: 'b', kind: 'page', title: 'B', pathPattern: '/b' },
        ],
        edges: [
          {
            id: 'e1',
            from: 'a',
            to: 'b',
            kind: 'link',
            confidence: 'high',
          },
        ],
      }),
    );
    expect(g.adjacency.get('a')?.out).toEqual(['b']);
    expect(g.adjacency.get('b')?.in).toEqual(['a']);
    expect([...neighbors(g, 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('search + resolve + inject', () => {
  test('search by path', () => {
    const g = indexDocument(
      doc({
        nodes: [
          { id: 'feed', kind: 'page', title: 'Лента', pathPattern: '/feed' },
          { id: 'wallet', kind: 'page', title: 'Кошелёк', pathPattern: '/wallet' },
        ],
        edges: [],
      }),
    );
    expect(searchNodes(g, 'кошел').map((n) => n.id)).toEqual(['wallet']);
  });

  test('resolveNodeUrl + applyStateToUrl role', () => {
    const url = resolveNodeUrl(
      { id: 'f', kind: 'page', title: 'F', pathPattern: '/feed', pathExample: '/feed' },
      'http://localhost:5175',
    );
    expect(url).toBe('http://localhost:5175/feed');
    const withRole = applyStateToUrl(url ?? '', {
      role: 'recruiter',
      query: { debug: '1' },
    });
    expect(withRole).toContain('lam_role=recruiter');
    expect(withRole).toContain('debug=1');
  });
});

describe('diffDocuments', () => {
  test('detects added node', () => {
    const left = doc({
      revision: 'L',
      nodes: [{ id: 'a', kind: 'page', title: 'A', pathPattern: '/a' }],
      edges: [],
    });
    const right = doc({
      revision: 'R',
      nodes: [
        { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
        { id: 'b', kind: 'page', title: 'B', pathPattern: '/b' },
      ],
      edges: [],
    });
    const d = diffDocuments(left, right);
    expect(d.nodes.added).toEqual(['b']);
  });
});
