import { describe, expect, test } from 'bun:test';
import {
  liveDiff,
  reconcile,
  transitionSlot,
  type PolicyState,
} from './index';

function state(partial: Partial<PolicyState> & Pick<PolicyState, 'candidates'>): PolicyState {
  return {
    mode: 'live',
    maxLiveIframes: 3,
    maxPinned: 2,
    pinned: new Set(),
    visible: new Set(),
    selected: null,
    prefetch: new Set(),
    iframeAllowed: Object.fromEntries(partial.candidates.map((id) => [id, true])),
    recentLiveScore: {},
    ...partial,
  };
}

describe('reconcile', () => {
  test('map-only → empty live set', () => {
    const r = reconcile(
      state({
        mode: 'map-only',
        candidates: ['a', 'b'],
        visible: new Set(['a', 'b']),
      }),
    );
    expect(r.liveIds.size).toBe(0);
  });

  test('budget caps visible pages', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 2,
        candidates: ['a', 'b', 'c', 'd'],
        visible: new Set(['a', 'b', 'c', 'd']),
      }),
    );
    expect(r.liveIds.size).toBe(2);
  });

  test('pinned beats visible for budget', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 1,
        candidates: ['a', 'b'],
        visible: new Set(['a']),
        pinned: new Set(['b']),
      }),
    );
    expect([...r.liveIds]).toEqual(['b']);
    expect(r.deferredPins).toEqual([]);
  });

  test('deferred pins when over maxLive', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 1,
        candidates: ['p1', 'p2'],
        pinned: new Set(['p1', 'p2']),
      }),
    );
    expect(r.liveIds.size).toBe(1);
    expect(r.deferredPins.length).toBe(1);
  });

  test('selected + visible priority order stable', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 2,
        candidates: ['x', 'y', 'z'],
        visible: new Set(['x', 'y', 'z']),
        selected: 'z',
      }),
    );
    expect(r.liveIds.has('z')).toBe(true);
    expect(r.liveIds.size).toBe(2);
  });

  test('iframeAllowed false excludes candidate', () => {
    const r = reconcile(
      state({
        candidates: ['a', 'b'],
        visible: new Set(['a', 'b']),
        iframeAllowed: { a: false, b: true },
        maxLiveIframes: 8,
      }),
    );
    expect([...r.liveIds]).toEqual(['b']);
  });
});

describe('transitionSlot', () => {
  test('IDLE → LOADING → LIVE → IDLE', () => {
    let s = transitionSlot('IDLE', 'shouldLoad');
    expect(s).toBe('LOADING');
    s = transitionSlot(s, 'onLoad');
    expect(s).toBe('LIVE');
    s = transitionSlot(s, 'freeze');
    expect(s).toBe('IDLE');
  });

  test('LOADING → ERROR → shouldLoad → LOADING', () => {
    let s = transitionSlot('LOADING', 'onError');
    expect(s).toBe('ERROR');
    s = transitionSlot(s, 'shouldLoad');
    expect(s).toBe('LOADING');
  });
});

describe('liveDiff', () => {
  test('load and freeze sets', () => {
    const d = liveDiff(new Set(['a', 'b']), new Set(['b', 'c']));
    expect(d.load).toEqual(['c']);
    expect(d.freeze).toEqual(['a']);
  });
});
