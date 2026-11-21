/**
 * Банка кук: Set-Cookie → банка → Cookie, переписывание для браузера.
 */
import { describe, expect, test } from 'bun:test';
import { cookieHeaderFor, mergeSetCookies, rewriteSetCookieForBrowser } from './cookie-jar';

const NOW = Date.parse('2026-11-21T00:00:00Z');

describe('cookie-jar', () => {
  test('Set-Cookie попадает в банку, повтор заменяет, Max-Age=0 удаляет', () => {
    let jar = mergeSetCookies([], ['sid=1; Path=/; HttpOnly; Max-Age=3600', 'csrf=a; Path=/api'], NOW);
    expect(jar.map((c) => [c.name, c.value, c.path])).toEqual([['sid', '1', '/'], ['csrf', 'a', '/api']]);
    jar = mergeSetCookies(jar, ['sid=2; Path=/'], NOW);
    expect(jar.find((c) => c.name === 'sid')?.value).toBe('2');
    jar = mergeSetCookies(jar, ['csrf=; Path=/api; Max-Age=0'], NOW);
    expect(jar.map((c) => c.name)).toEqual(['sid']);
  });

  test('Cookie: браузерные куки главнее, банка добавляет недостающие по пути, истёкшие не идут', () => {
    const jar = mergeSetCookies([], ['sid=jar; Path=/', 'api=1; Path=/api', 'old=1; Path=/; Expires=Thu, 01 Jan 2020 00:00:00 GMT'], NOW);
    expect(cookieHeaderFor('sid=browser', jar, '/api/v1/me', NOW)).toBe('sid=browser; api=1');
    expect(cookieHeaderFor('', jar, '/feed', NOW)).toBe('sid=jar');
  });

  test('для браузера: без Domain и Secure, SameSite=Lax', () => {
    expect(rewriteSetCookieForBrowser('sid=1; Domain=localhost; Path=/; Secure; HttpOnly; SameSite=None')).toBe(
      'sid=1; Path=/; HttpOnly; SameSite=Lax',
    );
  });
});
