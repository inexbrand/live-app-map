import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_MAX_LIVE,
  DEFAULT_MAX_PINNED,
  applyStateToUrl,
  liveDiff,
  reconcile,
  type PolicyState,
} from './index';

/**
 * Минимальный PolicyState для проверки re-export reconcile.
 */
function policyState(
  partial: Partial<PolicyState> & Pick<PolicyState, 'candidates'>,
): PolicyState {
  return {
    mode: 'live',
    maxLiveIframes: DEFAULT_MAX_LIVE,
    maxPinned: DEFAULT_MAX_PINNED,
    pinned: new Set(),
    visible: new Set(),
    selected: null,
    prefetch: new Set(),
    iframeAllowed: Object.fromEntries(
      partial.candidates.map((id) => [id, true] as const),
    ),
    recentLiveScore: {},
    ...partial,
  };
}

describe('@live-app-map/visualizer re-export surface', () => {
  test('DEFAULT_MAX_LIVE — числовой бюджет iframe (канон policy)', () => {
    expect(typeof DEFAULT_MAX_LIVE).toBe('number');
    expect(DEFAULT_MAX_LIVE).toBe(8);
    expect(Number.isInteger(DEFAULT_MAX_LIVE)).toBe(true);
    expect(DEFAULT_MAX_LIVE).toBeGreaterThan(0);
  });

  test('reconcile — pin побеждает visible при бюджете 1', () => {
    const result = reconcile(
      policyState({
        maxLiveIframes: 1,
        candidates: ['visible-page', 'pinned-page'],
        visible: new Set(['visible-page']),
        pinned: new Set(['pinned-page']),
      }),
    );

    expect([...result.liveIds]).toEqual(['pinned-page']);
    expect(result.deferredPins).toEqual([]);
    expect(result.reasons.get('pinned-page')).toBe('pinned');
    expect(result.liveIds.has('visible-page')).toBe(false);
  });

  test('reconcile — map-only → пустой live (через re-export)', () => {
    const result = reconcile(
      policyState({
        mode: 'map-only',
        candidates: ['a', 'b'],
        visible: new Set(['a', 'b']),
        pinned: new Set(['a']),
      }),
    );

    expect(result.liveIds.size).toBe(0);
    expect(result.deferredPins).toEqual([]);
    expect(result.reasons.size).toBe(0);
  });

  test('reconcile — DEFAULT_MAX_LIVE ограничивает visible candidates', () => {
    const candidates = Array.from({ length: DEFAULT_MAX_LIVE + 4 }, (_, i) => `n${i}`);
    const result = reconcile(
      policyState({
        candidates,
        visible: new Set(candidates),
      }),
    );

    expect(result.liveIds.size).toBe(DEFAULT_MAX_LIVE);
  });

  test('applyStateToUrl — role + query + hash (через re-export graph)', () => {
    const base = 'http://localhost:5175/feed';
    const withInject = applyStateToUrl(base, {
      role: 'recruiter',
      query: { debug: '1' },
      hash: 'section-roles',
    });

    expect(withInject).toContain('lam_role=recruiter');
    expect(withInject).toContain('debug=1');
    expect(withInject.endsWith('#section-roles')).toBe(true);
    expect(withInject.startsWith('http://localhost:5175/feed')).toBe(true);
  });

  test('applyStateToUrl — без inject возвращает base as-is', () => {
    const base = 'http://localhost:16002/admin';
    expect(applyStateToUrl(base)).toBe(base);
    expect(applyStateToUrl(base, undefined)).toBe(base);
  });

  test('applyStateToUrl — невалидный base не бросает, возвращает исходную строку', () => {
    const bad = 'not-a-url';
    expect(applyStateToUrl(bad, { role: 'employer' })).toBe(bad);
  });

  test('liveDiff — соседний re-export policy работает', () => {
    const previous = new Set(['a', 'b']);
    const next = new Set(['b', 'c']);
    const diff = liveDiff(previous, next);
    expect(diff.load).toEqual(['c']);
    expect(diff.freeze).toEqual(['a']);
  });
});
