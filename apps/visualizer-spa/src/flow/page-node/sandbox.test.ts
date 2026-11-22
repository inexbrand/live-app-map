/**
 * Sandbox живого экрана и подпись вместо него.
 */
import { describe, expect, test } from 'bun:test';
import {
  isTrustedIframeBaseUrl,
  resolveIframeSandboxPreset,
  resolvePagePlaceholder,
  SANDBOX_STRICT,
  SANDBOX_TRUSTED,
  sandboxAttrForPreset,
  sandboxPresetLabel,
} from './sandbox';

describe('доверенный адрес iframe', () => {
  test('локальные хосты и прокси визуализатора — доверенные', () => {
    for (const url of [
      'http://localhost:5175/',
      'http://127.0.0.1:3000',
      'http://[::1]:80/',
      'https://vite.localhost:5175/#/feed',
      '/__lam_proxy/miniapp/#/',
      'http://x/__lam_proxy/admin/',
      '/__lam_proxy/site/',
      '/__lam_proxy/https/example.com/',
    ]) {
      expect(isTrustedIframeBaseUrl(url)).toBe(true);
    }
  });

  test('чужой хост, пусто, null — не доверенные', () => {
    for (const url of ['https://example.com/', 'https://localhost.evil.com/', '', '   ', null, undefined, 'http://[bad']) {
      expect(isTrustedIframeBaseUrl(url)).toBe(false);
    }
  });

  test('preset: явный выбор побеждает адрес; атрибут и подпись по preset', () => {
    expect(resolveIframeSandboxPreset('https://example.com/')).toBe('strict');
    expect(resolveIframeSandboxPreset('http://localhost:1/')).toBe('trusted');
    expect(resolveIframeSandboxPreset('http://localhost:1/', 'strict')).toBe('strict');
    expect(resolveIframeSandboxPreset('https://example.com/', 'trusted')).toBe('trusted');
    expect(sandboxAttrForPreset('trusted')).toBe(SANDBOX_TRUSTED);
    expect(sandboxAttrForPreset('strict')).toBe(SANDBOX_STRICT);
    expect(SANDBOX_STRICT).not.toContain('allow-same-origin');
    expect(sandboxPresetLabel('trusted')).toBe('Sandbox trusted (localhost)');
    expect(sandboxPresetLabel('strict')).toBe('Sandbox strict');
  });
});

describe('подпись вместо живого экрана', () => {
  const live: Parameters<typeof resolvePagePlaceholder>[0] = { mode: 'live', hasUrl: true, iframeError: false };

  test('ошибка загрузки важнее всего', () => {
    expect(resolvePagePlaceholder({ ...live, iframeError: true, isWarm: true })).toBe('Ошибка загрузки iframe');
    expect(resolvePagePlaceholder({ mode: 'compact', hasUrl: false, iframeError: true })).toBe('Ошибка загрузки iframe');
  });

  test('live: нет адреса → в памяти → закреплён → в кадре → вне кадра', () => {
    expect(resolvePagePlaceholder({ ...live, hasUrl: false, isWarm: true })).toBe('Нет URL');
    expect(resolvePagePlaceholder({ ...live, isWarm: true, isPinned: true })).toBe('В памяти (заморожен, без перезагрузки)');
    expect(resolvePagePlaceholder({ ...live, isPinned: true, inViewport: true })).toBe('Pin в очереди (бюджет iframe)');
    expect(resolvePagePlaceholder({ ...live, inViewport: true })).toBe('В кадре · ждёт слот (бюджет iframe)');
    expect(resolvePagePlaceholder(live)).toBe('Вне кадра · live при приближении');
  });

  test('другие режимы', () => {
    expect(resolvePagePlaceholder({ mode: 'compact', hasUrl: true, iframeError: false })).toBe('Компакт');
    expect(resolvePagePlaceholder({ mode: 'map-only', hasUrl: true, iframeError: false })).toBe('Только карта');
  });
});
