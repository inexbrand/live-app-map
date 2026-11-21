/**
 * Свежесть dev-входа Korbor.
 */
import { describe, expect, test } from 'bun:test';
import { isDogfoodValueStale } from './korbor-dogfood';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const jwt = (exp: number): string => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

describe('isDogfoodValueStale', () => {
  test('JWT админки: свежий — нет, истекающий через 30 с и истёкший — да', () => {
    expect(isDogfoodValueStale('admin', jwt(NOW / 1000 + 900), NOW)).toBe(false);
    expect(isDogfoodValueStale('admin', jwt(NOW / 1000 + 30), NOW)).toBe(true);
    expect(isDogfoodValueStale('admin', jwt(NOW / 1000 - 1), NOW)).toBe(true);
    expect(isDogfoodValueStale('admin', 'мусор', NOW)).toBe(true);
  });

  test('initData: моложе часа — нет, старше или без auth_date — да', () => {
    expect(isDogfoodValueStale('user', `auth_date=${NOW / 1000 - 600}&hash=x`, NOW)).toBe(false);
    expect(isDogfoodValueStale('user', `auth_date=${NOW / 1000 - 7200}&hash=x`, NOW)).toBe(true);
    expect(isDogfoodValueStale('user', 'hash=x', NOW)).toBe(true);
    expect(isDogfoodValueStale('user', undefined, NOW)).toBe(true);
  });
});
