import { describe, expect, test } from 'bun:test';
import { applyDogfoodToUrl } from './dogfood-url';

describe('applyDogfoodToUrl', () => {
  test('adds miniapp init data', () => {
    const u = applyDogfoodToUrl('https://vite.localhost:5175/feed', {
      miniappInitData: 'query_id=1&user=%7B%7D&hash=x',
    });
    expect(u).toContain('lam_init_data=');
    expect(u).toContain('feed');
  });

  test('adds admin token', () => {
    const u = applyDogfoodToUrl('http://localhost:16002/vacancies', {
      adminAccessToken: 'tok-abc',
    });
    expect(u).toContain('lam_access_token=tok-abc');
  });
});
