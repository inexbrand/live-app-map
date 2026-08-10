import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildKorborDeepLinkQuery,
  KORBOR_DOGFOOD_IDS,
  KORBOR_PRESETS,
  korborMapPublicPath,
  type KorborDogfoodId,
} from './korbor-presets';

const publicDir = path.resolve(import.meta.dir, '../public');
const publicMapsDir = path.join(publicDir, 'maps');

type LivePage = {
  readonly id?: string;
  readonly path?: string;
  readonly states?: readonly {
    readonly name?: string;
    readonly inject?: { readonly role?: string };
  }[];
};

type LiveMap = {
  readonly pages?: readonly LivePage[];
  readonly baseUrl?: string;
};

/**
 * Читает public map JSON по path пресета (`/maps/...` → public/maps/...).
 */
function readPresetMap(presetPath: string): LiveMap {
  const rel = presetPath.replace(/^\//, '');
  const file = path.join(publicDir, rel);
  expect(existsSync(file)).toBe(true);
  return JSON.parse(readFileSync(file, 'utf8')) as LiveMap;
}

/**
 * Имя файла dogfood map: korbor-{id}.liveappmap.json.
 */
function dogfoodFileName(id: string): string {
  return `korbor-${id}.liveappmap.json`;
}

describe('KORBOR_PRESETS', () => {
  test('dogfood id: miniapp, admin, site; пресеты включают all + dogfood', () => {
    expect(KORBOR_DOGFOOD_IDS).toEqual(['miniapp', 'admin', 'site']);
    expect(KORBOR_PRESETS.length).toBeGreaterThanOrEqual(3);
    const ids = KORBOR_PRESETS.map((p) => p.id);
    for (const id of KORBOR_DOGFOOD_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toContain('all');
  });

  test('каждый preset: id/label/baseUrl/path под public/maps', () => {
    for (const p of KORBOR_PRESETS) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.baseUrl).toBe('string');
      expect(
        p.baseUrl.startsWith('http://') || p.baseUrl.startsWith('https://'),
      ).toBe(true);
      expect(p.path.startsWith('/maps/')).toBe(true);
      expect(p.path.endsWith('.liveappmap.json')).toBe(true);

      const fileName = p.path.slice('/maps/'.length);
      expect(fileName).toBe(dogfoodFileName(p.id));
      if (p.id !== 'all') {
        expect(p.path).toBe(korborMapPublicPath(p.id as KorborDogfoodId));
      }

      const abs = path.join(publicMapsDir, fileName);
      expect(existsSync(abs)).toBe(true);

      const json = readPresetMap(p.path);
      expect(Array.isArray(json.pages)).toBe(true);
      expect((json.pages?.length ?? 0) > 0).toBe(true);
      // baseUrl пресета = baseUrl карты (dogfood consistency)
      if (json.baseUrl !== undefined) {
        expect(json.baseUrl).toBe(p.baseUrl);
      }
    }
  });

  test('map path начинается с /maps/ и файл-имя совпадает dogfood', () => {
    for (const id of KORBOR_DOGFOOD_IDS) {
      const expectedPath = `/maps/${dogfoodFileName(id)}`;
      expect(korborMapPublicPath(id)).toBe(expectedPath);
      const preset = KORBOR_PRESETS.find((p) => p.id === id);
      expect(preset).toBeDefined();
      expect(preset?.path).toBe(expectedPath);
      expect(existsSync(path.join(publicMapsDir, dogfoodFileName(id)))).toBe(
        true,
      );
    }
  });

  test('deep-link map URLs: map + baseUrl (+ role) из пресета', () => {
    for (const p of KORBOR_PRESETS) {
      const q = buildKorborDeepLinkQuery(p);
      expect(q.startsWith('?')).toBe(true);
      const params = new URLSearchParams(q.slice(1));
      expect(params.get('map')).toBe(p.path);
      expect(params.get('baseUrl')).toBe(p.baseUrl);
      expect(params.get('role')).toBeNull();
      // path deep-link = public asset
      expect(params.get('map')?.startsWith('/maps/')).toBe(true);
      expect(existsSync(path.join(publicDir, p.path.replace(/^\//, '')))).toBe(
        true,
      );
    }

    const mini = KORBOR_PRESETS.find((p) => p.id === 'miniapp');
    expect(mini).toBeDefined();
    if (mini === undefined) {
      return;
    }
    const withRole = buildKorborDeepLinkQuery(mini, { role: 'recruiter' });
    const roleParams = new URLSearchParams(withRole.slice(1));
    expect(roleParams.get('map')).toBe('/maps/korbor-miniapp.liveappmap.json');
    expect(roleParams.get('baseUrl')).toBe('https://vite.localhost:5175');
    expect(roleParams.get('role')).toBe('recruiter');
  });

  test('miniapp baseUrl — vite.localhost:5175 (TLS dogfood)', () => {
    const mini = KORBOR_PRESETS.find((p) => p.id === 'miniapp');
    expect(mini?.baseUrl).toBe('https://vite.localhost:5175');
    expect(mini?.baseUrl).toContain('5175');
  });

  test('admin/site baseUrl — localhost 16002 / 16001', () => {
    const admin = KORBOR_PRESETS.find((p) => p.id === 'admin');
    const site = KORBOR_PRESETS.find((p) => p.id === 'site');
    expect(admin?.baseUrl).toBe('http://localhost:16002');
    expect(site?.baseUrl).toBe('http://localhost:16001');
  });

  test('golden counts: miniapp ≥15, admin ≥25, site ≥1 pages', () => {
    const mini = readPresetMap('/maps/korbor-miniapp.liveappmap.json');
    const admin = readPresetMap('/maps/korbor-admin.liveappmap.json');
    const site = readPresetMap('/maps/korbor-site.liveappmap.json');
    expect(mini.pages?.length ?? 0).toBeGreaterThanOrEqual(15);
    expect(admin.pages?.length ?? 0).toBeGreaterThanOrEqual(25);
    expect(site.pages?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  test('miniapp pages содержат states recruiter/employer где enrich', () => {
    const mini = readPresetMap('/maps/korbor-miniapp.liveappmap.json');
    const pages = mini.pages ?? [];
    const withRecruiter = pages.filter((p) =>
      p.states?.some(
        (s) => s.name === 'recruiter' || s.inject?.role === 'recruiter',
      ),
    );
    const withEmployer = pages.filter((p) =>
      p.states?.some(
        (s) => s.name === 'employer' || s.inject?.role === 'employer',
      ),
    );
    expect(withRecruiter.length).toBeGreaterThanOrEqual(3);
    expect(withEmployer.length).toBeGreaterThanOrEqual(2);

    const feed = pages.find(
      (p) => p.path === '/feed' || p.id === 'route:/feed' || p.id === 'feed',
    );
    if (feed) {
      const names = new Set((feed.states ?? []).map((s) => s.name));
      expect(names.has('recruiter') || names.has('employer')).toBe(true);
    }
  });
});
