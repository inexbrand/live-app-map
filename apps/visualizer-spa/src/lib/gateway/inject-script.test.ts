/**
 * Состояние входа страницы: 401 при старте, который приложение само
 * исправило через refresh, не делает экран «не авторизован».
 */
import { describe, expect, test } from 'bun:test';
import { injectScript, nextAuthState, type AuthState } from './inject-script';

function run(events: Array<[number, string, boolean]>): AuthState {
  return events.reduce<AuthState>((s, [status, path, json]) => nextAuthState(s, status, path, json), { fails: 0 });
}

describe('nextAuthState', () => {
  test('401 → refresh 200 → данные: вход восстановлен, сбоев нет', () => {
    expect(run([[401, '/api/v1/auth/web/session', true], [401, '/api/v1/auth/web/session', true], [200, '/api/v1/auth/web/refresh', true], [200, '/api/v1/employer/vacancies', true]])).toEqual({ fails: 0 });
  });

  test('401 без последующего успеха — не авторизован, последний путь в подсказке', () => {
    expect(run([[200, '/api/v1/config', true], [401, '/api/v1/me', true]])).toEqual({ fails: 1, last: '401 /api/v1/me' });
  });

  test('успех не-JSON (картинка, модуль) не считается восстановлением', () => {
    expect(run([[403, '/api/v1/admin', true], [200, '/logo.png', false]]).fails).toBe(1);
  });

  test('функция встраивается в скрипт страницы и там работает', () => {
    const script = injectScript({}, 'recruiter', true);
    const src = /next=(function[\s\S]*?\n\})[;,]/.exec(script)?.[1] ?? /next=(function[^;]*?\})[;,]/.exec(script)?.[1];
    expect(src).toBeDefined();
    const fn = new Function(`return (${src ?? ''})`)() as typeof nextAuthState;
    expect(fn(fn({ fails: 0 }, 401, '/a', true), 200, '/b', true)).toEqual({ fails: 0 });
  });
});
