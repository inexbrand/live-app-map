import { describe, expect, test, beforeEach } from 'bun:test';
import type { AppMapDocument } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { applyDogfoodToUrl } from './dogfood-url';
import {
  formatDogfoodActorOption,
  getKorborApiBase,
  isDogfoodClientEnabled,
  mapSessionToInject,
  type DogfoodSession,
} from './dogfood-api';

const sampleDoc: AppMapDocument = {
  formatVersion: 1,
  kind: 'live-app-map',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generator: { name: 'test', version: '0' },
  revision: 'df1',
  project: { root: '.', framework: 'manual', name: 'df' },
  baseUrl: 'https://vite.localhost:5175',
  nodes: [
    {
      id: 'route:/feed',
      kind: 'page',
      title: 'Feed',
      pathPattern: '/feed',
      pathExample: '/feed',
      url: 'https://vite.localhost:5175/feed',
    },
    {
      id: 'route:/vacancies',
      kind: 'page',
      title: 'Vacancies',
      pathPattern: '/vacancies',
      pathExample: '/vacancies',
      url: 'http://localhost:16002/vacancies',
    },
  ],
  edges: [],
};

describe('dogfood-api', () => {
  test('getKorborApiBase defaults to :16000', () => {
    expect(getKorborApiBase()).toContain('16000');
  });

  test('formatDogfoodActorOption', () => {
    expect(
      formatDogfoodActorOption({
        id: '1',
        kind: 'admin',
        label: 'ops@test',
        role: 'admin',
      }),
    ).toContain('админ');
    expect(
      formatDogfoodActorOption({
        id: '2',
        kind: 'user',
        label: 'Rec',
        role: 'recruiter',
      }),
    ).toContain('recruiter');
  });

  test('isDogfoodClientEnabled fails closed in production', () => {
    expect(isDogfoodClientEnabled({ PROD: true })).toBe(false);
    expect(isDogfoodClientEnabled({ MODE: 'production' })).toBe(false);
    expect(isDogfoodClientEnabled({ PROD: false, MODE: 'development' })).toBe(
      true,
    );
  });

  test('mapSessionToInject admin → token only', () => {
    const s: DogfoodSession = {
      kind: 'admin',
      actorId: 'a1',
      label: 'Ops',
      role: 'admin',
      accessToken: 'tok-admin-xyz',
      expiresIn: 900,
    };
    const inj = mapSessionToInject(s);
    expect(inj.adminAccessToken).toBe('tok-admin-xyz');
    expect(inj.miniappInitData).toBe('');
    expect(inj.globalRole).toBe('');
  });

  test('mapSessionToInject recruiter → initData + role', () => {
    const s: DogfoodSession = {
      kind: 'user',
      actorId: 'u1',
      label: 'Rec',
      role: 'recruiter',
      initData: 'auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc',
    };
    const inj = mapSessionToInject(s);
    expect(inj.miniappInitData).toContain('hash=');
    expect(inj.globalRole).toBe('recruiter');
    expect(inj.adminAccessToken).toBe('');
  });
});

describe('dogfood inject → resolveLiveUrl (shipped store path)', () => {
  beforeEach(() => {
    const st = useAppStore.getState();
    st.clearMap();
    st.setUseTlsProxy(false);
    st.setDogfoodAdminAccessToken('');
    st.setDogfoodMiniappInitData('');
    st.setGlobalRole('');
    st.setBaseUrlOverride('');
  });

  test('after applying mapped admin session, admin page URL has lam_access_token', () => {
    useAppStore.getState().loadDocument(sampleDoc);
    const inj = mapSessionToInject({
      kind: 'admin',
      actorId: 'a1',
      label: 'Ops',
      role: 'admin',
      accessToken: 'live-token-99',
    });
    useAppStore.getState().setDogfoodAdminAccessToken(inj.adminAccessToken);
    const url = useAppStore.getState().resolveLiveUrl('route:/vacancies');
    expect(url).toBeTruthy();
    expect(url).toContain('lam_access_token=live-token-99');
    // same pure helper used by store path
    expect(
      applyDogfoodToUrl('http://localhost:16002/vacancies', {
        adminAccessToken: inj.adminAccessToken,
      }),
    ).toContain('lam_access_token=live-token-99');
  });

  test('after applying mapped user session, miniapp URL has lam_init_data + role', () => {
    useAppStore.getState().loadDocument(sampleDoc);
    const initData = 'query_id=lam&user=%7B%22id%22%3A42%7D&auth_date=1&hash=deadbeef';
    const inj = mapSessionToInject({
      kind: 'user',
      actorId: 'u1',
      label: 'Emp',
      role: 'employer',
      initData,
    });
    useAppStore.getState().setDogfoodMiniappInitData(inj.miniappInitData);
    useAppStore.getState().setGlobalRole(inj.globalRole);
    const url = useAppStore.getState().resolveLiveUrl('route:/feed');
    expect(url).toBeTruthy();
    expect(url).toContain('lam_init_data=');
    expect(url).toContain('lam_role=employer');
  });
});
