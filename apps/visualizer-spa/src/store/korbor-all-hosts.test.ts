/**
 * Runtime: load shipped korbor-all through store and assert multi-surface hosts survive.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  liveAppMapToAppMap,
  parseLiveAppMapJson,
} from '@live-app-map/schema';
import { mapSessionToInject } from '../lib/dogfood-api';
import { useAppStore } from './app-store';

const allPath = path.resolve(
  import.meta.dir,
  '../../../../maps/korbor-all.liveappmap.json',
);

describe('korbor-all multi-host via loadDocument (shipped map)', () => {
  beforeEach(() => {
    const s = useAppStore.getState();
    s.clearMap();
    s.setBaseUrlOverride('');
    s.setUseTlsProxy(false);
    s.setDogfoodAdminAccessToken('');
    s.setDogfoodMiniappInitData('');
    s.setGlobalRole('');
  });

  test('loadDocument preserves three surface hosts (not rewrite all to baseUrl)', () => {
    expect(existsSync(allPath)).toBe(true);
    const raw = readFileSync(allPath, 'utf8');
    const parsed = parseLiveAppMapJson(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const enterprise = liveAppMapToAppMap(parsed.document);
    useAppStore.getState().loadDocument(enterprise);
    const doc = useAppStore.getState().document;
    expect(doc).toBeTruthy();
    if (!doc) {
      return;
    }

    const hosts = new Set<string>();
    for (const n of doc.nodes) {
      if (n.kind !== 'page' || !n.url) {
        continue;
      }
      hosts.add(new URL(n.url).host);
    }
    expect(hosts.has('vite.localhost:5175')).toBe(true);
    expect(hosts.has('localhost:16002')).toBe(true);
    expect(hosts.has('localhost:16001')).toBe(true);
    // must not collapse to only site base
    expect(hosts.size).toBeGreaterThanOrEqual(3);

    const roots = doc.nodes
      .filter((n) => n.kind === 'page' && (n.pathExample === '/' || n.pathPattern === '/'))
      .map((n) => n.id)
      .sort();
    expect(roots.some((id) => id.includes('miniapp'))).toBe(true);
    expect(roots.some((id) => id.includes('admin'))).toBe(true);
    expect(roots.some((id) => id.includes('site'))).toBe(true);
  });

  test('session inject on multi-surface: admin token + miniapp initData keep correct hosts', () => {
    const raw = readFileSync(allPath, 'utf8');
    const parsed = parseLiveAppMapJson(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    useAppStore.getState().loadDocument(liveAppMapToAppMap(parsed.document));

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

    const adminInj = mapSessionToInject({
      kind: 'admin',
      actorId: 'a',
      label: 'Ops',
      role: 'admin',
      accessToken: 'TOK-MULTI-1',
    });
    useAppStore.getState().setDogfoodAdminAccessToken(adminInj.adminAccessToken);
    useAppStore.getState().setDogfoodMiniappInitData(adminInj.miniappInitData);
    const adminUrl = useAppStore.getState().resolveLiveUrl(adminId);
    expect(adminUrl).toContain('localhost:16002');
    expect(adminUrl).toContain('lam_access_token=TOK-MULTI-1');
    expect(adminUrl).not.toContain('localhost:16001/vacancies');

    const userInj = mapSessionToInject({
      kind: 'user',
      actorId: 'u',
      label: 'Rec',
      role: 'recruiter',
      initData: 'auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc',
    });
    useAppStore.getState().setDogfoodAdminAccessToken(userInj.adminAccessToken);
    useAppStore.getState().setDogfoodMiniappInitData(userInj.miniappInitData);
    useAppStore.getState().setGlobalRole(userInj.globalRole);
    const miniUrl = useAppStore.getState().resolveLiveUrl(miniId);
    expect(miniUrl).toContain('vite.localhost:5175');
    expect(miniUrl).toContain('lam_init_data=');
    expect(miniUrl).toContain('lam_role=recruiter');
    // not rewritten onto site base
    expect(miniUrl).not.toContain('localhost:16001/feed');
  });
});
