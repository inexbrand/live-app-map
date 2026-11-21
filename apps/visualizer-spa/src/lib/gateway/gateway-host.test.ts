/**
 * Адреса шлюза: кодирование цели и профиля в имени хоста и обратно.
 */
import { describe, expect, test } from 'bun:test';
import { parseGatewayHost, toGatewayUrl } from './gateway-host';

describe('gateway-host', () => {
  test('адрес страницы через шлюз и обратно — тот же origin приложения', () => {
    const cases = [
      ['https://vite.localhost:5175/feed?x=1#/a', 'recruiter', 'http://recruiter--s5175-vite.localhost:4320/feed?x=1#/a', 'https://vite.localhost:5175'],
      ['http://localhost:16002/deals', 'admin', 'http://admin--h16002.localhost:4320/deals', 'http://localhost:16002'],
      ['http://127.0.0.1:16000/health', 'anon', 'http://anon--h16000-ip.localhost:4320/health', 'http://127.0.0.1:16000'],
    ] as const;
    for (const [app, profile, gw, origin] of cases) {
      expect(toGatewayUrl(app, profile, 4320)).toBe(gw);
      const parsed = parseGatewayHost(new URL(gw).host);
      expect(parsed?.origin).toBe(origin);
      expect(parsed?.profile).toBe(profile);
    }
  });

  test('чужие хосты и плохие профили не проходят', () => {
    expect(toGatewayUrl('https://example.com/', 'anon', 4320)).toBeNull();
    expect(toGatewayUrl('http://localhost:1/', 'Bad Profile', 4320)).toBeNull();
    expect(toGatewayUrl('http://localhost:1/', 'a--b', 4320)).toBeNull();
    expect(parseGatewayHost('localhost:4320')).toBeNull();
    expect(parseGatewayHost('anon--h99999.localhost:4320')).toBeNull();
    expect(parseGatewayHost('evil.com')).toBeNull();
  });
});
