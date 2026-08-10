import { describe, expect, test } from 'bun:test';
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';
import {
  applyPlugins,
  type LiveAppMapPlugin,
  type ScanContext,
} from './index';

/**
 * Минимальный документ для unit-тестов plugin-api.
 */
function doc(
  partial: Partial<AppMapDocument> & Pick<AppMapDocument, 'nodes' | 'edges'>,
): AppMapDocument {
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

function pageNode(id: string, path: string): AppMapNode {
  return {
    id,
    kind: 'page',
    title: id,
    pathPattern: path,
  };
}

function linkEdge(id: string, from: string, to: string): AppMapEdge {
  return {
    id,
    from,
    to,
    kind: 'link',
    confidence: 'high',
  };
}

const baseCtx: Omit<ScanContext, 'document'> = {
  projectRoot: '/proj',
  appRoot: '/proj/app',
};

describe('applyPlugins', () => {
  test('пустой список plugins → тот же identity и содержимое', async () => {
    const input = doc({
      nodes: [pageNode('home', '/')],
      edges: [],
    });

    const result = await applyPlugins(input, [], baseCtx);

    expect(result).toBe(input);
    expect(result).toEqual(input);
    expect(result.nodes).toBe(input.nodes);
    expect(result.edges).toBe(input.edges);
  });

  test('плагин без contribute/transform не меняет документ', async () => {
    const input = doc({
      nodes: [pageNode('home', '/')],
      edges: [],
    });
    const idle: LiveAppMapPlugin = { name: 'idle' };

    const result = await applyPlugins(input, [idle], baseCtx);

    expect(result).toBe(input);
  });

  test('contributeNodes и contributeEdges дописывают узлы и рёбра', async () => {
    const input = doc({
      nodes: [pageNode('home', '/')],
      edges: [linkEdge('e0', 'home', 'home')],
    });

    const merger: LiveAppMapPlugin = {
      name: 'merger',
      contributeNodes: () => [pageNode('extra', '/extra')],
      contributeEdges: () => [linkEdge('e1', 'home', 'extra')],
    };

    const result = await applyPlugins(input, [merger], baseCtx);

    expect(result.nodes.map((n) => n.id)).toEqual(['home', 'extra']);
    expect(result.edges.map((e) => e.id)).toEqual(['e0', 'e1']);
    // исходный документ не мутируется
    expect(input.nodes).toHaveLength(1);
    expect(input.edges).toHaveLength(1);
  });

  test('async contribute* await-ятся и merge идёт в порядке plugins', async () => {
    const input = doc({
      nodes: [pageNode('a', '/a')],
      edges: [],
    });

    const first: LiveAppMapPlugin = {
      name: 'first',
      contributeNodes: async () => {
        await Promise.resolve();
        return [pageNode('b', '/b')];
      },
    };
    const second: LiveAppMapPlugin = {
      name: 'second',
      contributeNodes: (ctx) => {
        // видит узел, добавленный first
        expect(ctx.document.nodes.map((n) => n.id)).toEqual(['a', 'b']);
        return [pageNode('c', '/c')];
      },
      contributeEdges: () => [linkEdge('ab', 'a', 'b')],
    };

    const result = await applyPlugins(input, [first, second], baseCtx);

    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(result.edges.map((e) => e.id)).toEqual(['ab']);
  });

  test('transformDocument вызывается после contribute того же плагина', async () => {
    const input = doc({
      nodes: [pageNode('seed', '/seed')],
      edges: [],
    });
    const order: string[] = [];

    const plugin: LiveAppMapPlugin = {
      name: 'ordered',
      contributeNodes: () => {
        order.push('contribute');
        return [pageNode('from-contrib', '/from-contrib')];
      },
      transformDocument: (current) => {
        order.push('transform');
        expect(current.nodes.map((n) => n.id)).toEqual([
          'seed',
          'from-contrib',
        ]);
        return {
          ...current,
          revision: 'after-transform',
          nodes: current.nodes.map((n) =>
            n.id === 'from-contrib' ? { ...n, title: 'tagged' } : n,
          ),
        };
      },
    };

    const result = await applyPlugins(input, [plugin], baseCtx);

    expect(order).toEqual(['contribute', 'transform']);
    expect(result.revision).toBe('after-transform');
    expect(result.nodes.find((n) => n.id === 'from-contrib')?.title).toBe(
      'tagged',
    );
  });

  test('цепочка transformDocument: следующий плагин видит результат предыдущего', async () => {
    const input = doc({
      nodes: [pageNode('n', '/')],
      edges: [],
    });
    const seenRevisions: string[] = [];

    const a: LiveAppMapPlugin = {
      name: 'a',
      transformDocument: (current, ctx) => {
        seenRevisions.push(ctx.document.revision);
        return { ...current, revision: 'rev-a' };
      },
    };
    const b: LiveAppMapPlugin = {
      name: 'b',
      transformDocument: async (current, ctx) => {
        await Promise.resolve();
        seenRevisions.push(ctx.document.revision);
        return {
          ...current,
          revision: `${ctx.document.revision}+b`,
          nodes: [...current.nodes, pageNode('from-b', '/b')],
        };
      },
    };

    const result = await applyPlugins(input, [a, b], baseCtx);

    expect(seenRevisions).toEqual(['r1', 'rev-a']);
    expect(result.revision).toBe('rev-a+b');
    expect(result.nodes.map((n) => n.id)).toEqual(['n', 'from-b']);
  });

  test('ScanContext.document на каждом шаге указывает на актуальный документ', async () => {
    const input = doc({
      nodes: [pageNode('root', '/')],
      edges: [],
    });
    const projectRoots: string[] = [];

    const plugin: LiveAppMapPlugin = {
      name: 'ctx-check',
      contributeNodes: (ctx) => {
        projectRoots.push(ctx.projectRoot);
        expect(ctx.appRoot).toBe('/proj/app');
        expect(ctx.document.nodes[0]?.id).toBe('root');
        return [];
      },
      transformDocument: (current, ctx) => {
        expect(ctx.document).toBe(current);
        return current;
      },
    };

    await applyPlugins(input, [plugin], baseCtx);
    expect(projectRoots).toEqual(['/proj']);
  });
});
