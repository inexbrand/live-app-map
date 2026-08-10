import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KORBOR_PRESETS } from './korbor-presets';

const publicDir = path.resolve(import.meta.dir, '../public');

describe('KORBOR_PRESETS', () => {
  test('все path существуют в public/', () => {
    expect(KORBOR_PRESETS.length).toBe(3);
    for (const p of KORBOR_PRESETS) {
      const rel = p.path.replace(/^\//, '');
      const file = path.join(publicDir, rel);
      expect(existsSync(file)).toBe(true);
      const json = JSON.parse(readFileSync(file, 'utf8')) as {
        pages?: unknown[];
        baseUrl?: string;
      };
      expect(Array.isArray(json.pages)).toBe(true);
      expect((json.pages?.length ?? 0) > 0).toBe(true);
    }
  });

  test('miniapp baseUrl указывает на vite.localhost:5175', () => {
    const mini = KORBOR_PRESETS.find((p) => p.id === 'miniapp');
    expect(mini?.baseUrl).toContain('5175');
  });
});
