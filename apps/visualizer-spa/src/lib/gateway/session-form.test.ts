/**
 * Форма входа в профиль.
 */
import { describe, expect, test } from 'bun:test';
import { buildSessionRequest, type SessionFormFields } from './session-form';

const base: SessionFormFields = {
  id: 'admin',
  label: 'Админ',
  role: 'admin',
  origin: 'http://localhost:16002/metrics',
  method: 'korbor-dogfood',
  actor: 'admin:98c3',
  apiBase: 'http://127.0.0.1:16000',
  cookies: '',
  storageKey: '',
  storageValue: '',
};

describe('buildSessionRequest', () => {
  test('dev-вход korbor: POST с актёром, origin без пути', () => {
    expect(buildSessionRequest(base)).toEqual({
      ok: true,
      method: 'POST',
      path: '/__lam_sessions/admin/korbor-dogfood',
      body: { label: 'Админ', role: 'admin', origin: 'http://localhost:16002', kind: 'admin', actorId: '98c3', apiBase: 'http://127.0.0.1:16000' },
    });
  });

  test('вставка кук и токена: PUT', () => {
    const r = buildSessionRequest({ ...base, method: 'paste', cookies: 'sid=1', storageKey: 'tok', storageValue: 'v' });
    expect(r).toEqual({
      ok: true,
      method: 'PUT',
      path: '/__lam_sessions/admin',
      body: { label: 'Админ', role: 'admin', origin: 'http://localhost:16002', cookies: 'sid=1', storage: { tok: 'v' } },
    });
  });

  test('пустые обязательные поля — ошибка у нужного поля', () => {
    const field = (f: Partial<SessionFormFields>) => {
      const r = buildSessionRequest({ ...base, ...f });
      return r.ok ? null : r.field;
    };
    expect(field({ id: 'Bad Id' })).toBe('id');
    expect(field({ label: ' ' })).toBe('label');
    expect(field({ origin: '' })).toBe('origin');
    expect(field({ actor: '' })).toBe('actor');
    expect(field({ apiBase: '' })).toBe('apiBase');
    expect(field({ method: 'paste' })).toBe('cookies');
    expect(field({ method: 'paste', storageKey: 'tok' })).toBe('storageValue');
    expect(field({ method: 'paste', storageValue: 'v' })).toBe('storageKey');
  });
});
