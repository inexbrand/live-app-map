/**
 * Состояние экрана по отчёту шлюза.
 */
import { describe, expect, test } from 'bun:test';
import type { LamPageMessage } from './inject-script';
import { pageStatus } from './page-status';

const report = (over: Partial<LamPageMessage>): LamPageMessage => ({
  lam: 'page',
  href: 'http://x/',
  contentHeight: 1000,
  viewportHeight: 1000,
  authFailures: 0,
  profile: 'recruiter',
  hasSession: true,
  ...over,
});

describe('pageStatus', () => {
  test('нет отчёта — ничего не утверждаем', () => {
    expect(pageStatus(undefined, 900)).toEqual({ unauthorized: null, cropped: null, contentHeight: null });
  });

  test('страница выше окна — обрезана, в пределах запаса — нет', () => {
    expect(pageStatus(report({ contentHeight: 2400 }), 1080).cropped).toBe('Видно 1080 из 2400 px');
    expect(pageStatus(report({ contentHeight: 1085 }), 1080).cropped).toBeNull();
  });

  test('401 — не авторизован, с профилем и путём', () => {
    expect(pageStatus(report({ authFailures: 2, lastAuthFailure: '401 /api/v1/me' }), 1080).unauthorized).toBe(
      'Не авторизован (профиль «recruiter»): 401 /api/v1/me',
    );
    expect(pageStatus(report({ authFailures: 1, profile: 'anon', lastAuthFailure: '403 /x' }), 1080).unauthorized).toBe(
      'Не авторизован (нет профиля входа): 403 /x',
    );
  });
});
