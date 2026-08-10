import { describe, expect, test } from 'bun:test';
import { extractPathsFromSource, normalizeRrPath, rrToPattern } from './index';

describe('extractPathsFromSource', () => {
  test('reads miniapp-like config', () => {
    const src = `
      tabRoute("feed", "feed"),
      { path: "vacancies/:id" },
      { path: "employer/create" },
      <Navigate to="/feed" />
    `;
    const paths = extractPathsFromSource(src);
    expect(paths).toContain('feed');
    expect(paths).toContain('vacancies/:id');
    expect(paths).toContain('/feed');
  });
});

describe('rrToPattern', () => {
  test('converts :id', () => {
    expect(rrToPattern('/vacancies/:id')).toBe('/vacancies/[id]');
  });
});

describe('normalizeRrPath', () => {
  test('relative under parent', () => {
    expect(normalizeRrPath('feed', '/')).toBe('/feed');
  });
});
