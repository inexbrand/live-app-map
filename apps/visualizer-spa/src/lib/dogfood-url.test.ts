import { describe, expect, test } from 'bun:test';
import {
  applyDogfoodToUrl,
  ensureMiniappHashRoute,
} from './dogfood-url';

describe('applyDogfoodToUrl', () => {
  test('adds miniapp init data', () => {
    const u = applyDogfoodToUrl('https://vite.localhost:5175/feed', {
      miniappInitData: 'query_id=1&user=%7B%7D&hash=x',
    });
    expect(u).toContain('lam_init_data=');
    expect(u).toContain('feed');
  });

  test('adds admin token only on admin host', () => {
    const u = applyDogfoodToUrl('http://localhost:16002/vacancies', {
      adminAccessToken: 'tok-abc',
    });
    expect(u).toContain('lam_access_token=tok-abc');
    const site = applyDogfoodToUrl('http://localhost:16001/employers', {
      adminAccessToken: 'tok-abc',
      miniappInitData: 'x=1',
    });
    expect(site).not.toContain('lam_access_token');
    expect(site).not.toContain('lam_init_data');
  });
});

describe('ensureMiniappHashRoute', () => {
  test('pathname → hash, query сохраняется', () => {
    const u = ensureMiniappHashRoute(
      'https://vite.localhost:5175/employer/create?lam_role=employer',
    );
    expect(u).toContain('https://vite.localhost:5175/?lam_role=employer');
    expect(u).toContain('#/employer/create');
    expect(u).not.toMatch(/5175\/employer/);
  });

  test('proxy prefix: product path в hash, prefix в pathname', () => {
    const u = ensureMiniappHashRoute(
      'http://localhost:4310/__lam_proxy/miniapp/feed?lam_init_data=x',
    );
    expect(u).toContain('/__lam_proxy/miniapp/?lam_init_data=x');
    expect(u).toContain('#/feed');
  });

  test('already hash — idempotent', () => {
    const src = 'https://vite.localhost:5175/?q=1#/wallet';
    expect(ensureMiniappHashRoute(src)).toBe(src);
  });

  test('non-miniapp unchanged', () => {
    const src = 'http://localhost:16002/login';
    expect(ensureMiniappHashRoute(src)).toBe(src);
  });
});

