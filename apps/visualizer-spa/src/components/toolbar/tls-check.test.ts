/**
 * Ответ проверки TLS origin.
 */
import { describe, expect, test } from 'bun:test';
import { tlsCheckMessage, tlsCheckOf } from './tls-check';

describe('проверка TLS', () => {
  test('успех: статус и сообщение', () => {
    const j = tlsCheckOf({ ok: true, status: 200, message: 'cert ok', extra: 1 });
    expect(j).toEqual({ ok: true, status: 200, message: 'cert ok' });
    expect(tlsCheckMessage(j)).toBe('TLS OK · HTTP 200 · cert ok');
  });

  test('ошибка: текст ошибки, поля не того типа отброшены', () => {
    const j = tlsCheckOf({ ok: false, error: 'self-signed', status: '500', message: 7 });
    expect(j).toEqual({ ok: false, error: 'self-signed' });
    expect(tlsCheckMessage(j)).toBe('TLS fail · self-signed');
  });

  test('не объект или пусто — неуспех без подробностей', () => {
    for (const body of [null, 'html', 42, undefined]) {
      expect(tlsCheckOf(body)).toEqual({});
    }
    expect(tlsCheckMessage({})).toBe('TLS fail · unknown');
    expect(tlsCheckMessage({ ok: true })).toBe('TLS OK · HTTP — · ');
  });
});
