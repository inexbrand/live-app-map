import { describe, expect, test } from 'bun:test';
import { applyStateToUrl } from '@live-app-map/graph';

describe('state inject URLs (Korbor roles)', () => {
  test('recruiter query', () => {
    const url = applyStateToUrl('http://localhost:5175/feed', {
      role: 'recruiter',
      query: { lam_role: 'recruiter' },
    });
    expect(url).toContain('lam_role=recruiter');
    expect(url.startsWith('http://localhost:5175/feed')).toBe(true);
  });

  test('employer on create vacancy', () => {
    const url = applyStateToUrl('http://localhost:5175/employer/create', {
      role: 'employer',
    });
    expect(url).toContain('lam_role=employer');
  });

  test('page-state query overrides shared keys', () => {
    const url = applyStateToUrl('http://localhost:5175/feed?lam_role=recruiter', {
      query: { lam_role: 'employer', tab: 'mine' },
    });
    expect(url).toContain('lam_role=employer');
    expect(url).toContain('tab=mine');
  });

  test('hash inject without role leaves path', () => {
    const url = applyStateToUrl('http://localhost:5175/wallet', {
      hash: 'balance',
    });
    expect(url).toContain('#balance');
    expect(url).not.toContain('lam_role=');
  });

  test('clear inject returns base', () => {
    expect(applyStateToUrl('http://localhost:5175/feed')).toBe(
      'http://localhost:5175/feed',
    );
    expect(applyStateToUrl('http://localhost:5175/feed', undefined)).toBe(
      'http://localhost:5175/feed',
    );
  });

  test('both roles produce distinct query', () => {
    const rec = applyStateToUrl('http://localhost:5175/feed', {
      role: 'recruiter',
    });
    const emp = applyStateToUrl('http://localhost:5175/feed', {
      role: 'employer',
    });
    expect(rec).toContain('lam_role=recruiter');
    expect(emp).toContain('lam_role=employer');
    expect(rec).not.toBe(emp);
  });
});
