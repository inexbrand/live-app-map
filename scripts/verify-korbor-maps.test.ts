/**
 * Структурная проверка shipped Korbor maps (не mock): реальные файлы.
 *
 * Single-writer policy (см. scripts/scan-korbor.ts):
 * - канон: `maps/*.liveappmap.json`
 * - зеркало: `apps/visualizer-spa/public/maps/*.liveappmap.json` — content-equal с каноном
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLiveAppMapJson } from '../packages/schema/src/index';
import { applyStateToUrl } from '../packages/graph/src/index';

const root = path.resolve(import.meta.dir, '..');
/** Канон (source of truth) — пишет только scan-korbor. */
const mapsDir = path.join(root, 'maps');
/** Зеркало для Vite static serve. */
const pub = path.join(root, 'apps/visualizer-spa/public/maps');

const LIVEAPPMAP_NAMES = [
  'korbor-miniapp.liveappmap.json',
  'korbor-admin.liveappmap.json',
  'korbor-site.liveappmap.json',
  'korbor-all.liveappmap.json',
] as const;

const SURFACE_HOST: Record<string, string> = {
  'korbor-miniapp.liveappmap.json': 'vite.localhost:5175',
  'korbor-admin.liveappmap.json': 'localhost:16002',
  'korbor-site.liveappmap.json': 'localhost:16001',
};

function load(name: string) {
  const file = path.join(pub, name);
  expect(existsSync(file)).toBe(true);
  const text = readFileSync(file, 'utf8');
  const result = parseLiveAppMapJson(text);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.errors.map((e) => e.message).join('; '));
  }
  return result.document;
}

describe('korbor maps single-writer (maps/ ↔ public/maps)', () => {
  test('liveappmap pairs: content equality maps vs public', () => {
    for (const name of LIVEAPPMAP_NAMES) {
      const canonPath = path.join(mapsDir, name);
      const mirrorPath = path.join(pub, name);
      expect(existsSync(canonPath)).toBe(true);
      expect(existsSync(mirrorPath)).toBe(true);
      const canon = readFileSync(canonPath, 'utf8');
      const mirror = readFileSync(mirrorPath, 'utf8');
      expect(mirror).toBe(canon);
    }
  });

  test('public/maps has no liveappmap without matching maps/ canon', () => {
    if (!existsSync(pub)) {
      return;
    }
    const pubLives = readdirSync(pub).filter((f) => f.endsWith('.liveappmap.json'));
    for (const name of pubLives) {
      expect(existsSync(path.join(mapsDir, name))).toBe(true);
    }
  });
});

describe('korbor maps (shipped artifacts)', () => {
  test('miniapp has recruiter and employer states', () => {
    const doc = load('korbor-miniapp.liveappmap.json');
    expect(doc.pages.length).toBeGreaterThanOrEqual(10);
    expect(doc.baseUrl).toContain('5175');
    const roles = new Set<string>();
    for (const p of doc.pages) {
      for (const s of p.states ?? []) {
        if (s.inject?.role) {
          roles.add(s.inject.role);
        }
      }
    }
    expect(roles.has('recruiter')).toBe(true);
    expect(roles.has('employer')).toBe(true);
    const feed = doc.pages.find((p) => p.path === '/feed' || p.path?.endsWith('/feed'));
    expect(feed).toBeDefined();
    const url = applyStateToUrl(feed?.url ?? `${doc.baseUrl}/feed`, {
      role: 'recruiter',
    });
    expect(url).toContain('lam_role=recruiter');
  });

  test('admin has vacancies and deals', () => {
    const doc = load('korbor-admin.liveappmap.json');
    expect(doc.pages.length).toBeGreaterThanOrEqual(15);
    const paths = new Set(doc.pages.map((p) => p.path));
    expect(paths.has('/vacancies') || [...paths].some((p) => p?.includes('vacancies'))).toBe(
      true,
    );
    expect(paths.has('/deals') || [...paths].some((p) => p?.includes('deals'))).toBe(true);
  });

  test('site has home and payload admin', () => {
    const doc = load('korbor-site.liveappmap.json');
    expect(doc.pages.length).toBeGreaterThanOrEqual(3);
    const paths = doc.pages.map((p) => p.path);
    expect(paths).toContain('/');
    expect(paths.some((p) => p?.startsWith('/admin'))).toBe(true);
  });

  test('each surface page URLs match expected host', () => {
    for (const [name, host] of Object.entries(SURFACE_HOST)) {
      const doc = load(name);
      for (const p of doc.pages) {
        if (!p.url) {
          continue;
        }
        const u = new URL(p.url);
        expect(u.host).toBe(host);
      }
    }
  });

  test('no dual same-path roots within a single surface map', () => {
    for (const name of [
      'korbor-miniapp.liveappmap.json',
      'korbor-admin.liveappmap.json',
      'korbor-site.liveappmap.json',
    ] as const) {
      const doc = load(name);
      const byPath = new Map<string, string[]>();
      for (const p of doc.pages) {
        const key = p.path ?? p.id;
        const list = byPath.get(key) ?? [];
        list.push(p.id);
        byPath.set(key, list);
      }
      for (const [pathKey, ids] of byPath) {
        expect(ids.length).toBe(1);
        void pathKey;
      }
    }
  });

  test('korbor-all: three product entry roots, no god-root ownership', () => {
    const doc = load('korbor-all.liveappmap.json');
    const rootIds = doc.pages
      .filter((p) => p.path === '/')
      .map((p) => p.id)
      .sort();
    expect(rootIds).toContain('miniapp:route:/');
    expect(rootIds).toContain('admin:route:/');
    expect(rootIds).toContain('site:site-home');
    // cross-links may exist but each surface keeps own entry root id
    expect(rootIds.length).toBe(3);
  });
});
