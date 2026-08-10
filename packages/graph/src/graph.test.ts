import { describe, expect, test } from 'bun:test';
import type { AppMapDocument } from '@live-app-map/schema';
import {
  applyStateToUrl,
  diffDocuments,
  indexDocument,
  isSafeUrl,
  neighbors,
  resolveNodeUrl,
  searchNodes,
  sortDocument,
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

  test('applyStateToUrl injects hash (with and without #)', () => {
    const base = 'http://localhost:5175/feed';
    const withHash = applyStateToUrl(base, { hash: 'section-roles' });
    expect(withHash).toBe('http://localhost:5175/feed#section-roles');
    const withHashMark = applyStateToUrl(base, { hash: '#panel' });
    expect(withHashMark).toBe('http://localhost:5175/feed#panel');
    const combined = applyStateToUrl(base, {
      role: 'employer',
      query: { tab: '1' },
      hash: 'focus',
    });
    expect(combined).toContain('lam_role=employer');
    expect(combined).toContain('tab=1');
    expect(combined.endsWith('#focus')).toBe(true);
  });
});

describe('isSafeUrl + resolveNodeUrl invalid base', () => {
  test('isSafeUrl rejects non-http(s)', () => {
    expect(isSafeUrl('http://localhost:5175/feed')).toBe(true);
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,hi')).toBe(false);
    expect(isSafeUrl('ftp://files.example')).toBe(false);
    expect(isSafeUrl('not-a-url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  test('resolveNodeUrl returns null for invalid or unsafe base', () => {
    const node = {
      id: 'f',
      kind: 'page' as const,
      title: 'F',
      pathPattern: '/feed',
      pathExample: '/feed',
    };
    expect(resolveNodeUrl(node, 'not-a-url')).toBeNull();
    expect(resolveNodeUrl(node, ':::')).toBeNull();
    expect(resolveNodeUrl(node, 'javascript:alert(1)')).toBeNull();
    expect(resolveNodeUrl(node, 'data:text/html,x')).toBeNull();
    expect(resolveNodeUrl(node, '')).toBeNull();
    expect(resolveNodeUrl(node, null)).toBeNull();
  });

  test('resolveNodeUrl returns null for unsafe absolute node url/path', () => {
    expect(
      resolveNodeUrl(
        {
          id: 'x',
          kind: 'page',
          title: 'X',
          pathPattern: '/',
          url: 'javascript:alert(1)',
        },
        'http://localhost:5175',
      ),
    ).toBeNull();
    expect(
      resolveNodeUrl(
        {
          id: 'y',
          kind: 'page',
          title: 'Y',
          pathPattern: 'data:text/html,hi',
          pathExample: 'data:text/html,hi',
        },
        'http://localhost:5175',
      ),
    ).toBeNull();
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
    expect(d.leftRevision).toBe('L');
    expect(d.rightRevision).toBe('R');
  });

  test('nodes.removed + edges.added/removed + revision + changed fields', () => {
    const left = doc({
      revision: 'rev-left',
      nodes: [
        { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
        { id: 'gone', kind: 'page', title: 'Gone', pathPattern: '/gone' },
        { id: 'mut', kind: 'page', title: 'Old', pathPattern: '/old' },
      ],
      edges: [
        {
          id: 'e-old',
          from: 'a',
          to: 'gone',
          kind: 'link',
          confidence: 'high',
        },
        {
          id: 'e-keep',
          from: 'a',
          to: 'mut',
          kind: 'link',
          confidence: 'high',
        },
      ],
    });
    const right = doc({
      revision: 'rev-right',
      nodes: [
        { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
        { id: 'new', kind: 'page', title: 'New', pathPattern: '/new' },
        { id: 'mut', kind: 'page', title: 'New title', pathPattern: '/new-path' },
      ],
      edges: [
        {
          id: 'e-keep',
          from: 'a',
          to: 'mut',
          kind: 'link',
          confidence: 'high',
        },
        {
          id: 'e-new',
          from: 'a',
          to: 'new',
          kind: 'push',
          confidence: 'medium',
        },
      ],
    });
    const d = diffDocuments(left, right);
    expect(d.formatVersion).toBe(1);
    expect(d.leftRevision).toBe('rev-left');
    expect(d.rightRevision).toBe('rev-right');
    expect(d.nodes.added).toEqual(['new']);
    expect(d.nodes.removed).toEqual(['gone']);
    expect(d.nodes.changed).toEqual([
      { id: 'mut', fields: ['pathPattern', 'title'] },
    ]);
    expect(d.edges.added).toEqual(['e-new']);
    expect(d.edges.removed).toEqual(['e-old']);
  });
});

describe('sortDocument', () => {
  test('deterministic node/edge order by id', () => {
    const shuffled = doc({
      nodes: [
        { id: 'z', kind: 'page', title: 'Z', pathPattern: '/z' },
        { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
        { id: 'm', kind: 'page', title: 'M', pathPattern: '/m' },
      ],
      edges: [
        {
          id: 'e-b',
          from: 'a',
          to: 'm',
          kind: 'link',
          confidence: 'high',
        },
        {
          id: 'e-a',
          from: 'a',
          to: 'z',
          kind: 'link',
          confidence: 'high',
        },
      ],
    });
    const once = sortDocument(shuffled);
    const twice = sortDocument(once);
    expect(once.nodes.map((n) => n.id)).toEqual(['a', 'm', 'z']);
    expect(once.edges.map((e) => e.id)).toEqual(['e-a', 'e-b']);
    expect(twice).toEqual(once);
    expect(sortDocument(shuffled)).toEqual(once);
  });
});
