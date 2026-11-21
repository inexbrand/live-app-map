/**
 * Выбор профиля экрана.
 */
import { describe, expect, test } from 'bun:test';
import { pickProfile } from './profile-pick';
import type { ProfileSummary } from './session-store';

const MINI = 'https://vite.localhost:5175';
const ADMIN = 'http://localhost:16002';
const p = (id: string, role: string, origin: string): ProfileSummary => ({
  id,
  label: id,
  role,
  origins: [{ origin, cookies: [], storageKeys: ['k'] }],
  updatedAt: '',
});
const profiles = [p('admin', 'admin', ADMIN), p('employer', 'employer', MINI), p('recruiter', 'recruiter', MINI)];

describe('pickProfile', () => {
  test('стейт ноды главнее общей роли, общая главнее роли по умолчанию', () => {
    expect(pickProfile({ profiles, appOrigin: MINI, stateName: 'employer', globalRole: 'recruiter' })).toBe('employer');
    expect(pickProfile({ profiles, appOrigin: MINI, globalRole: 'recruiter', defaultStateName: 'employer' })).toBe('recruiter');
    expect(pickProfile({ profiles, appOrigin: MINI, defaultStateName: 'recruiter' })).toBe('recruiter');
  });

  test('профиль только своего приложения; нет подходящего — первый для приложения, нет никакого — anon', () => {
    expect(pickProfile({ profiles, appOrigin: ADMIN, stateName: 'recruiter' })).toBe('admin');
    expect(pickProfile({ profiles, appOrigin: 'http://localhost:16001' })).toBe('anon');
    expect(pickProfile({ profiles: [], appOrigin: MINI, stateName: 'recruiter' })).toBe('anon');
  });
});
