import { describe, expect, test } from 'bun:test';
import { parseVoiceSettings } from './voice-store';

describe('настройки голоса из localStorage', () => {
  test('сохранённые модель и язык', () => {
    expect(parseVoiceSettings('{"model":"small","language":"uz"}')).toEqual({ model: 'small', language: 'uz' });
  });

  test('нет настроек, битый JSON, не объект, чужие значения — base и русский', () => {
    for (const text of [null, '{', '42', 'null', '{"model":"huge","language":"de"}']) {
      expect(parseVoiceSettings(text)).toEqual({ model: 'base', language: 'ru' });
    }
  });

  test('известно одно поле — второе по умолчанию', () => {
    expect(parseVoiceSettings('{"language":"en"}')).toEqual({ model: 'base', language: 'en' });
  });
});
