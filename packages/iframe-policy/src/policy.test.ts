import { describe, expect, test } from 'bun:test';
import {
  liveDiff,
  priority,
  reconcile,
  transitionSlot,
  type IframeSlotState,
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

describe('priority', () => {
  test('явные веса: pin > selected > visible > prefetch', () => {
    const s = state({
      candidates: ['pin', 'sel', 'vis', 'pre', 'none'],
      pinned: new Set(['pin']),
      selected: 'sel',
      visible: new Set(['vis']),
      prefetch: new Set(['pre']),
    });
    const pinScore = priority('pin', s);
    const selectedScore = priority('sel', s);
    const visibleScore = priority('vis', s);
    const prefetchScore = priority('pre', s);
    const noneScore = priority('none', s);

    expect(pinScore).toBe(1000);
    expect(selectedScore).toBe(500);
    expect(visibleScore).toBe(100);
    expect(prefetchScore).toBe(20);
    expect(noneScore).toBe(0);

    expect(pinScore).toBeGreaterThan(selectedScore);
    expect(selectedScore).toBeGreaterThan(visibleScore);
    expect(visibleScore).toBeGreaterThan(prefetchScore);
    expect(prefetchScore).toBeGreaterThan(noneScore);
  });

  test('selected > visible: выбранный без pin обгоняет visible', () => {
    const s = state({
      candidates: ['a', 'b'],
      selected: 'a',
      visible: new Set(['b']),
    });
    expect(priority('a', s)).toBeGreaterThan(priority('b', s));
  });

  test('pin > selected: pin без selected обгоняет selected без pin', () => {
    const s = state({
      candidates: ['a', 'b'],
      pinned: new Set(['a']),
      selected: 'b',
    });
    expect(priority('a', s)).toBeGreaterThan(priority('b', s));
  });

  test('pin > visible: pin обгоняет visible', () => {
    const s = state({
      candidates: ['a', 'b'],
      pinned: new Set(['a']),
      visible: new Set(['b']),
    });
    expect(priority('a', s)).toBeGreaterThan(priority('b', s));
  });

  test('флаги суммируются + recency capped at 5', () => {
    const s = state({
      candidates: ['combo'],
      pinned: new Set(['combo']),
      selected: 'combo',
      visible: new Set(['combo']),
      prefetch: new Set(['combo']),
      recentLiveScore: { combo: 99 },
    });
    // 1000 + 500 + 100 + 20 + min(5, 99)
    expect(priority('combo', s)).toBe(1625);
  });
});

describe('reconcile', () => {
  test('map-only → empty live set (placeholder semantics: no iframes)', () => {
    const r = reconcile(
      state({
        mode: 'map-only',
        candidates: ['a', 'b'],
        visible: new Set(['a', 'b']),
        pinned: new Set(['a']),
        selected: 'b',
      }),
    );
    expect(r.liveIds.size).toBe(0);
    expect(r.deferredPins).toEqual([]);
    expect(r.reasons.size).toBe(0);
  });

  test('compact → empty live set (placeholder chrome only)', () => {
    const r = reconcile(
      state({
        mode: 'compact',
        candidates: ['a'],
        visible: new Set(['a']),
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
    expect(r.reasons.get('b')).toBe('pinned');
  });

  test('selected beats visible for budget', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 1,
        candidates: ['a', 'b'],
        visible: new Set(['a', 'b']),
        selected: 'b',
      }),
    );
    expect([...r.liveIds]).toEqual(['b']);
    expect(r.reasons.get('b')).toBe('selected');
  });

  test('pin beats selected for budget (pin > selected > visible)', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 1,
        candidates: ['pin', 'sel', 'vis'],
        pinned: new Set(['pin']),
        selected: 'sel',
        visible: new Set(['vis', 'sel', 'pin']),
      }),
    );
    expect([...r.liveIds]).toEqual(['pin']);
    expect(r.reasons.get('pin')).toBe('pinned');
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
    const liveId = [...r.liveIds][0];
    expect(r.deferredPins).toEqual(
      liveId === 'p1' ? ['p2'] : ['p1'],
    );
    expect(r.deferredPins.every((id) => !r.liveIds.has(id))).toBe(true);
  });

  test('deferredPins: excess pin loses to budget while pin still beats visible', () => {
    const r = reconcile(
      state({
        maxLiveIframes: 1,
        candidates: ['p1', 'p2', 'v'],
        pinned: new Set(['p1', 'p2']),
        visible: new Set(['v']),
      }),
    );
    expect(r.liveIds.size).toBe(1);
    expect(r.liveIds.has('v')).toBe(false);
    expect([...r.liveIds][0]?.startsWith('p')).toBe(true);
    expect(r.deferredPins.length).toBe(1);
    expect(r.deferredPins.every((id) => id.startsWith('p'))).toBe(true);
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
  test('IDLE → LOADING → LIVE → IDLE (happy path)', () => {
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

  test('LIVE → ERROR (onError from LIVE)', () => {
    expect(transitionSlot('LIVE', 'onError')).toBe('ERROR');
  });

  test('ERROR → LOADING (retry via shouldLoad)', () => {
    expect(transitionSlot('ERROR', 'shouldLoad')).toBe('LOADING');
  });

  test('freeze → IDLE from every state', () => {
    const states: readonly IframeSlotState[] = ['IDLE', 'LOADING', 'LIVE', 'ERROR'];
    for (const current of states) {
      expect(transitionSlot(current, 'freeze')).toBe('IDLE');
    }
  });

  test('full FSM matrix: legal and illegal transitions stay consistent', () => {
    const states: readonly IframeSlotState[] = ['IDLE', 'LOADING', 'LIVE', 'ERROR'];
    const events = ['shouldLoad', 'onLoad', 'onError', 'freeze'] as const;

    const expected: Record<
      IframeSlotState,
      Record<(typeof events)[number], IframeSlotState>
    > = {
      IDLE: {
        shouldLoad: 'LOADING',
        onLoad: 'IDLE',
        onError: 'IDLE',
        freeze: 'IDLE',
      },
      LOADING: {
        shouldLoad: 'LOADING',
        onLoad: 'LIVE',
        onError: 'ERROR',
        freeze: 'IDLE',
      },
      LIVE: {
        shouldLoad: 'LIVE',
        onLoad: 'LIVE',
        onError: 'ERROR',
        freeze: 'IDLE',
      },
      ERROR: {
        shouldLoad: 'LOADING',
        onLoad: 'ERROR',
        onError: 'ERROR',
        freeze: 'IDLE',
      },
    };

    for (const current of states) {
      for (const event of events) {
        expect(transitionSlot(current, event)).toBe(expected[current][event]);
      }
    }
  });
});

describe('liveDiff', () => {
  test('load and freeze sets', () => {
    const d = liveDiff(new Set(['a', 'b']), new Set(['b', 'c']));
    expect(d.load).toEqual(['c']);
    expect(d.freeze).toEqual(['a']);
  });
});
