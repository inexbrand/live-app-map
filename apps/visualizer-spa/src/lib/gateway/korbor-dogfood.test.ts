/**
 * Свежесть dev-входа Korbor.
 */
import { describe, expect, test } from 'bun:test';
import { createBearerCache, isDogfoodValueStale, type KorborRenewal } from './korbor-dogfood';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const jwt = (exp: number): string => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

/** API, похожее на korbor: обмен initData на токен с exp; считает обмены, умеет отвечать 429. */
function fakeKorbor(tokenTtlSec: number) {
  const state = { exchanges: 0, limited: false };
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname !== '/api/v1/auth/telegram/miniapp' || req.method !== 'POST') {
        return new Response('not found', { status: 404 });
      }
      state.exchanges += 1;
      if (state.limited) {
        return new Response('{}', { status: 429 });
      }
      return Response.json({ data: { accessToken: jwt(Math.floor(Date.now() / 1000) + tokenTtlSec) } });
    },
  });
  const renewal: KorborRenewal = { kind: 'user', actorId: 'recruiter-1', apiBase: `http://127.0.0.1:${server.port}` };
  return { state, renewal, stop: () => server.stop(true) };
}

describe('createBearerCache — обмен initData на Bearer мини-аппа', () => {
  test('повторные и одновременные запросы берут один токен: korbor не отвечает 429', async () => {
    const api = fakeKorbor(900);
    try {
      const bearer = createBearerCache();
      const first = await Promise.all([bearer(api.renewal, 'auth_date=1&hash=a'), bearer(api.renewal, 'auth_date=1&hash=a')]);
      const again = await bearer(api.renewal, 'auth_date=1&hash=a');
      expect(first.every((r) => r.ok)).toBe(true);
      expect(again).toEqual(first[0]);
      expect(api.state.exchanges).toBe(1);
      // Другой вход профиля — свой токен.
      await bearer(api.renewal, 'auth_date=2&hash=b');
      expect(api.state.exchanges).toBe(2);
    } finally {
      api.stop();
    }
  });

  test('истекающий токен меняется заново, отказ не запоминается', async () => {
    const api = fakeKorbor(30);
    try {
      const bearer = createBearerCache();
      await bearer(api.renewal, 'auth_date=1&hash=a');
      await bearer(api.renewal, 'auth_date=1&hash=a');
      expect(api.state.exchanges).toBe(2);

      api.state.limited = true;
      expect(await bearer(api.renewal, 'auth_date=3&hash=c')).toEqual({ ok: false, error: 'вход мини-аппа не выдан (HTTP 429)' });
      api.state.limited = false;
      expect((await bearer(api.renewal, 'auth_date=3&hash=c')).ok).toBe(true);
    } finally {
      api.stop();
    }
  });

  test('админке обмен не нужен: токен и есть Bearer', async () => {
    const bearer = createBearerCache();
    expect(await bearer({ kind: 'admin', actorId: 'a', apiBase: 'http://127.0.0.1:1' }, 'tok')).toEqual({ ok: true, token: 'tok' });
  });
});

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
