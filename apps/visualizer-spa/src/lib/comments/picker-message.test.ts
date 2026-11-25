/**
 * Ответы страницы в режиме выбора: перезагруженная страница сразу получает выбор снова.
 */
import { describe, expect, test } from 'bun:test';
import { onPickerMessage } from './use-comments';

const PAGE = { lam: 'page', href: 'http://x.localhost/#/feed', contentHeight: 844, viewportHeight: 844, authFailures: 0, lastAuthFailure: null, profile: 'recruiter', hasSession: true };

describe('onPickerMessage', () => {
  test('отчёт загрузки выбранного экрана — выбор включается сразу', () => {
    let n = 0;
    onPickerMessage('s1', 's1', PAGE, () => n++);
    expect(n).toBe(1);
  });

  test('чужой экран и посторонние сообщения выбор не трогают', () => {
    let n = 0;
    onPickerMessage('s1', 's2', PAGE, () => n++);
    onPickerMessage(null, 's1', PAGE, () => n++);
    onPickerMessage('s1', 's1', { lam: 'something' }, () => n++);
    expect(n).toBe(0);
  });
});
