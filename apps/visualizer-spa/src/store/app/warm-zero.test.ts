/**
 * Warm keep-alive 0 в настройках — «0 (сразу unmount)»: экраны вне бюджета не держатся в DOM.
 */
import { describe, expect, test } from 'bun:test';
import { useAppStore } from '../app-store';
import { clampMaxWarm } from './iframe-budget';

describe('warm 0', () => {
  test('лимит 0 остаётся нулём, а не «без лимита»', () => {
    expect(clampMaxWarm(0)).toBe(0);
    expect(clampMaxWarm(-2)).toBe(0);
    expect(clampMaxWarm(9999)).toBe(9999);
    expect(clampMaxWarm(6)).toBe(6);
  });

  test('в store: 0 — ни одного warm iframe', () => {
    useAppStore.getState().setMaxWarmIframes(0);
    expect(useAppStore.getState().maxWarmIframes).toBe(0);
    expect(useAppStore.getState().warmPageIds.size).toBe(0);
    useAppStore.getState().setMaxWarmIframes(8);
  });
});
