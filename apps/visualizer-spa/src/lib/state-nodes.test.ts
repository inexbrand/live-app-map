import { describe, expect, test } from 'bun:test';
import type { AppMapDocument, AppMapPageState } from '@live-app-map/schema';
import { expandStateNodes, lamStateValue, mergeProjectStates, stateNodeId, stateNodeInfo } from './state-nodes';

const FEED = 'miniapp:route:/feed';

function doc(states: readonly AppMapPageState[] | undefined): AppMapDocument {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r',
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5175',
    groups: [{ id: 'miniapp', title: 'Мини-приложение' }],
    nodes: [
      { id: FEED, kind: 'page', title: 'Лента', pathPattern: '/feed', groupIds: ['miniapp'], ...(states === undefined ? {} : { states }) },
      { id: 'miniapp:route:/me', kind: 'page', title: 'Профиль', pathPattern: '/me', groupIds: ['miniapp'] },
    ],
    edges: [],
  };
}

const EMPTY: AppMapPageState = { name: 'empty', id: 'empty', label: 'Пустая лента', kind: 'empty', role: 'recruiter' };
const FILTERS: AppMapPageState = { name: 'filters-open', id: 'filters-open', label: 'Фильтры', kind: 'ui', steps: [{ click: 'text=Фильтры' }] };

describe('узлы-состояния', () => {
  test('у экрана с состояниями — узел на каждое, сразу за экраном, в той же группе', () => {
    const out = expandStateNodes(doc([EMPTY, FILTERS, { name: 'recruiter', inject: { role: 'recruiter' } }]), true);
    expect(out.nodes.map((n) => n.id)).toEqual([FEED, stateNodeId(FEED, 'empty'), stateNodeId(FEED, 'filters-open'), 'miniapp:route:/me']);
    const empty = out.nodes[1];
    expect(empty?.title).toBe('Лента · Пустая лента');
    expect(empty?.groupIds).toEqual(['miniapp']);
    expect(empty?.pathPattern).toBe('/feed');
    expect(empty?.states?.[0]?.inject?.query?.['lam_state']).toBe(lamStateValue(FEED, 'empty'));
    expect(empty?.states?.[0]?.inject?.role).toBe('recruiter');
    const info = empty === undefined ? null : stateNodeInfo(empty);
    expect(info).toEqual({ screenId: FEED, stateId: 'empty', label: 'Пустая лента', kind: 'empty', role: 'recruiter', steps: [] });
    const filters = out.nodes[2];
    expect(filters === undefined ? null : stateNodeInfo(filters)?.steps).toEqual([{ click: 'text=Фильтры' }]);
    // экран сам — не узел-состояние
    expect(out.nodes[0] === undefined ? 'нет' : stateNodeInfo(out.nodes[0])).toBeNull();
  });

  test('вид выключен или состояний по контракту нет — карта та же', () => {
    const d = doc([EMPTY]);
    expect(expandStateNodes(d, false)).toBe(d);
    const old = doc([{ name: 'recruiter', inject: { role: 'recruiter' } }]);
    expect(expandStateNodes(old, true)).toBe(old);
  });

  test('lam_state: экран и состояние через «/», экран со «/» внутри делится по последнему', () => {
    const v = lamStateValue(FEED, 'empty');
    expect(v).toBe('miniapp:route:/feed/empty');
    expect(v.slice(v.lastIndexOf('/') + 1)).toBe('empty');
  });

  test('states.ts главнее карты: одноимённое заменяется, новое добавляется, чужой экран пропускается', () => {
    const fromMap: AppMapPageState = { ...EMPTY, label: 'из карты' };
    const merged = mergeProjectStates(
      doc([fromMap, { name: 'recruiter', inject: { role: 'recruiter' } }]),
      new Map([
        [FEED, [EMPTY, FILTERS]],
        ['site:route:/нет', [EMPTY]],
      ]),
    );
    const states = merged.nodes[0]?.states ?? [];
    expect(states.map((s) => s.name)).toEqual(['recruiter', 'empty', 'filters-open']);
    expect(states.find((s) => s.id === 'empty')?.label).toBe('Пустая лента');
    expect(merged.nodes.length).toBe(2);
  });

  test('нет состояний проекта — та же карта', () => {
    const d = doc([EMPTY]);
    expect(mergeProjectStates(d, null)).toBe(d);
  });
});
