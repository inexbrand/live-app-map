/**
 * Runtime: real UI load path (setBaseUrlOverride → loadUnknownJson) must keep
 * multi-surface hosts for korbor-all — same order as MapToolbar/App loadPreset.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KORBOR_PRESETS } from '../korbor-presets';
import { mapSessionToInject } from '../lib/dogfood-api';
import { applyLoadedKorborPreset } from '../lib/load-korbor-preset';
import { useAppStore } from './app-store';

const allPath = path.resolve(
  import.meta.dir,
  '../../../../maps/korbor-all.liveappmap.json',
);

const allPreset = KORBOR_PRESETS.find((p) => p.id === 'korbor-all');
if (allPreset === undefined) {
  throw new Error('KORBOR_PRESETS missing id=korbor-all');
}

function pageHosts(
  doc: NonNullable<ReturnType<typeof useAppStore.getState>['document']>,
): Map<string, number> {
  const hosts = new Map<string, number>();
  for (const n of doc.nodes) {
    if (n.kind !== 'page' || !n.url) {
      continue;
    }
    const host = new URL(n.url).host;
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
  }
  return hosts;
}

describe('korbor-all multi-host via REAL UI load path', () => {
  beforeEach(() => {
    const s = useAppStore.getState();
    s.clearMap();
    // Intentionally leave residual override noise cleared first, then UI path re-sets it
    s.setBaseUrlOverride('');
    s.setUseTlsProxy(false);
    s.setDogfoodAdminAccessToken('');
    s.setDogfoodMiniappInitData('');
    s.setGlobalRole('');
  });

  test('applyLoadedKorborPreset (MapToolbar path) keeps three surface hosts under override', () => {
    expect(existsSync(allPath)).toBe(true);
    const raw = JSON.parse(readFileSync(allPath, 'utf8')) as unknown;

    // Same order as MapToolbar/App: setBaseUrlOverride(preset.baseUrl) then load
    applyLoadedKorborPreset(allPreset, raw, {
      setBaseUrlOverride: (url) => useAppStore.getState().setBaseUrlOverride(url),
      loadUnknownJson: (json) => useAppStore.getState().loadUnknownJson(json),
      setMode: (mode) => useAppStore.getState().setMode(mode),
    });

    expect(useAppStore.getState().baseUrlOverride).toBe(allPreset.baseUrl);
    expect(allPreset.baseUrl).toContain('16001');

    const doc = useAppStore.getState().document;
    expect(doc).toBeTruthy();
    if (!doc) {
      return;
    }

    const hosts = pageHosts(doc);
    expect(hosts.get('vite.localhost:5175') ?? 0).toBeGreaterThan(0);
    expect(hosts.get('localhost:16002') ?? 0).toBeGreaterThan(0);
    expect(hosts.get('localhost:16001') ?? 0).toBeGreaterThan(0);
    expect(hosts.size).toBeGreaterThanOrEqual(3);
    // must NOT collapse everything onto site base from preset.baseUrl
    const onlySite = hosts.size === 1 && hosts.has('localhost:16001');
    expect(onlySite).toBe(false);

    const miniFeed = doc.nodes.find(
      (n) =>
        n.kind === 'page' &&
        n.id.startsWith('miniapp:') &&
        (n.pathPattern === '/feed' || n.pathExample === '/feed'),
    );
    const adminVac = doc.nodes.find(
      (n) =>
        n.kind === 'page' &&
        n.id.startsWith('admin:') &&
        (n.pathPattern === '/vacancies' || n.pathExample === '/vacancies'),
    );
    expect(miniFeed?.url).toContain('vite.localhost:5175');
    expect(adminVac?.url).toContain('localhost:16002');
    expect(miniFeed?.url).not.toContain('localhost:16001/feed');
    expect(adminVac?.url).not.toContain('localhost:16001/vacancies');

    const roots = doc.nodes
      .filter((n) => n.kind === 'page' && (n.pathExample === '/' || n.pathPattern === '/'))
      .map((n) => n.id)
      .sort();
    expect(roots.some((id) => id.includes('miniapp'))).toBe(true);
    expect(roots.some((id) => id.includes('admin'))).toBe(true);
    expect(roots.some((id) => id.includes('site'))).toBe(true);
  });

  test('deep-link path: setBaseUrlOverride then loadUnknownJson does not collapse hosts', () => {
    const raw = JSON.parse(readFileSync(allPath, 'utf8')) as unknown;
    // App.tsx deep-link: ?baseUrl=... then fetch map → loadUnknownJson
    useAppStore.getState().setBaseUrlOverride('http://localhost:16001');
    useAppStore.getState().loadUnknownJson(raw);

    const doc = useAppStore.getState().document;
    expect(doc).toBeTruthy();
    if (!doc) {
      return;
    }
    const hosts = pageHosts(doc);
    expect(hosts.size).toBeGreaterThanOrEqual(3);
    expect(hosts.has('vite.localhost:5175')).toBe(true);
    expect(hosts.has('localhost:16002')).toBe(true);
    expect(hosts.has('localhost:16001')).toBe(true);
  });

  test('session inject after UI-path load: admin + miniapp keys on correct hosts (dual run)', () => {
    const raw = JSON.parse(readFileSync(allPath, 'utf8')) as unknown;
    applyLoadedKorborPreset(allPreset, raw, {
      setBaseUrlOverride: (url) => useAppStore.getState().setBaseUrlOverride(url),
      loadUnknownJson: (json) => useAppStore.getState().loadUnknownJson(json),
      setMode: (mode) => useAppStore.getState().setMode(mode),
    });

    const adminId =
      useAppStore
        .getState()
        .document?.nodes.find(
          (n) =>
            n.kind === 'page' &&
            n.id.startsWith('admin:') &&
            (n.pathPattern === '/vacancies' || n.pathExample === '/vacancies'),
        )?.id ?? null;
    const miniId =
      useAppStore
        .getState()
        .document?.nodes.find(
          (n) =>
            n.kind === 'page' &&
            n.id.startsWith('miniapp:') &&
            (n.pathPattern === '/feed' || n.pathExample === '/feed'),
        )?.id ?? null;
    expect(adminId).toBeTruthy();
    expect(miniId).toBeTruthy();
    if (!adminId || !miniId) {
      return;
    }

    for (let run = 1; run <= 2; run += 1) {
      const adminInj = mapSessionToInject({
        kind: 'admin',
        actorId: `a-${run}`,
        label: 'Ops',
        role: 'admin',
        accessToken: `TOK-MULTI-${run}`,
      });
      useAppStore.getState().setDogfoodAdminAccessToken(adminInj.adminAccessToken);
      useAppStore.getState().setDogfoodMiniappInitData(adminInj.miniappInitData);
      const adminUrl = useAppStore.getState().resolveLiveUrl(adminId);
      expect(adminUrl).toContain('localhost:16002');
      expect(adminUrl).toContain(`lam_access_token=TOK-MULTI-${run}`);
      expect(adminUrl).not.toContain('localhost:16001/vacancies');

      const userInj = mapSessionToInject({
        kind: 'user',
        actorId: `u-${run}`,
        label: 'Rec',
        role: 'recruiter',
        initData: `auth_date=${run}&user=%7B%22id%22%3A${run}%7D&hash=abc`,
      });
      useAppStore.getState().setDogfoodAdminAccessToken(userInj.adminAccessToken);
      useAppStore.getState().setDogfoodMiniappInitData(userInj.miniappInitData);
      useAppStore.getState().setGlobalRole(userInj.globalRole);
      const miniUrl = useAppStore.getState().resolveLiveUrl(miniId);
      expect(miniUrl).toContain('vite.localhost:5175');
      expect(miniUrl).toContain('lam_init_data=');
      expect(miniUrl).toContain('lam_role=recruiter');
      expect(miniUrl).not.toContain('localhost:16001/feed');
    }
  });

  test('single-surface override still force-rewrites (admin map → custom base)', () => {
    const adminPath = path.resolve(
      import.meta.dir,
      '../../../../maps/korbor-admin.liveappmap.json',
    );
    expect(existsSync(adminPath)).toBe(true);
    const adminPreset = KORBOR_PRESETS.find((p) => p.id === 'korbor-admin');
    expect(adminPreset).toBeTruthy();
    if (!adminPreset) {
      return;
    }
    const raw = JSON.parse(readFileSync(adminPath, 'utf8')) as unknown;
    // Pretend user retargets: set override then load
    useAppStore.getState().setBaseUrlOverride('http://localhost:9999');
    useAppStore.getState().loadUnknownJson(raw);
    const doc = useAppStore.getState().document;
    expect(doc).toBeTruthy();
    if (!doc) {
      return;
    }
    const hosts = pageHosts(doc);
    expect(hosts.has('localhost:9999')).toBe(true);
    expect(hosts.has('localhost:16002')).toBe(false);
  });
});
