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
});
