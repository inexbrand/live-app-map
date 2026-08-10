import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KORBOR_PRESETS } from './korbor-presets';

const publicDir = path.resolve(import.meta.dir, '../public');

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
 * Читает public map JSON по path пресета.
 */
function readPresetMap(presetPath: string): LiveMap {
  const rel = presetPath.replace(/^\//, '');
  const file = path.join(publicDir, rel);
  expect(existsSync(file)).toBe(true);
  return JSON.parse(readFileSync(file, 'utf8')) as LiveMap;
}

describe('KORBOR_PRESETS', () => {
  test('все path существуют в public/', () => {
    expect(KORBOR_PRESETS.length).toBe(3);
    for (const p of KORBOR_PRESETS) {
      const json = readPresetMap(p.path);
      expect(Array.isArray(json.pages)).toBe(true);
      expect((json.pages?.length ?? 0) > 0).toBe(true);
    }
  });

  test('miniapp baseUrl указывает на vite.localhost:5175', () => {
    const mini = KORBOR_PRESETS.find((p) => p.id === 'miniapp');
    expect(mini?.baseUrl).toContain('5175');
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
