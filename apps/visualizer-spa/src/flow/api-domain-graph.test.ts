/**
 * Домены API на холсте: на срезе korbor каждый вызов экрана ведёт в домен своего роута.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
// Регистрирует хуки act до тестов: openMap грузит карту в стор
import '@testing-library/react';
import { openMap, resetStores } from '../test/fixtures';
import { withApiDomains } from './api-domain-graph';

useDom();

beforeEach(() => {
  resetStores();
});

describe('домены API на холсте', () => {
  test('сервисы заменены доменами, ребро экран → домен на каждую пару', () => {
    const doc = openMap('korbor-miniapp');
    const routes = doc.code?.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    const g = withApiDomains(doc);
    expect(g.nodes.some((n) => doc.nodes.some((o) => o.kind === 'service' && o.id === n.id))).toBe(false);
    const domainNodes = g.nodes.filter((n) => typeof n.metadata?.['apiDomain'] === 'string');
    expect(domainNodes.length).toBeGreaterThan(1);
    const apiEdges = g.edges.filter((e) => e.kind === 'api');
    const pairs = apiEdges.map((e) => `${e.from}->${e.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Каждый роут каждого исходного вызова — ребро из того же экрана в домен, где лежит этот роут
    const domainOfRoute = new Map(domainNodes.flatMap((n) => ((n.metadata?.['routeIds'] ?? []) as string[]).map((id): [string, string] => [id, n.id])));
    for (const e of doc.edges.filter((x) => x.kind === 'api')) {
      for (const id of (e.metadata?.['routeIds'] ?? []) as string[]) {
        expect(pairs).toContain(`${e.from}->${domainOfRoute.get(id)}`);
      }
    }
    for (const n of domainNodes) {
      expect(n.metadata?.['screens']).toBe(apiEdges.filter((e) => e.to === n.id).length);
    }
    expect(g.edges.filter((e) => e.kind !== 'api')).toEqual(doc.edges.filter((e) => e.kind !== 'api'));
  });

  test('карта без роутов — как была', () => {
    const doc = openMap('korbor-miniapp');
    const bare = { ...doc, code: undefined };
    const g = withApiDomains(bare);
    expect(g.nodes).toBe(bare.nodes);
    expect(g.edges).toBe(bare.edges);
  });
});
