import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { DEFAULT_STREAM_CDP_PORT, streamBrowserArgs, streamCdpPort, streamProfileDir, streamTabsFile } from './stream-browser';

describe('постоянный браузер трансляции: порт, профиль, флаги', () => {
  test('порт из LAM_STREAM_CDP_PORT, мусор и пусто — порт по умолчанию', () => {
    expect(streamCdpPort({ LAM_STREAM_CDP_PORT: '9333' })).toBe(9333);
    expect(streamCdpPort({ LAM_STREAM_CDP_PORT: 'abc' })).toBe(DEFAULT_STREAM_CDP_PORT);
    expect(streamCdpPort({ LAM_STREAM_CDP_PORT: '70000' })).toBe(DEFAULT_STREAM_CDP_PORT);
    expect(streamCdpPort({})).toBe(DEFAULT_STREAM_CDP_PORT);
  });

  test('профиль — свой на каждый порт в LOCALAPPDATA; список вкладок владельца — в профиле своего порта', () => {
    const env = { LOCALAPPDATA: 'C:/L', LAM_STREAM_CDP_PORT: '9333' };
    expect(streamProfileDir(env, 9333)).toBe(path.join('C:/L', 'live-app-map', 'stream-browser', '9333'));
    expect(streamProfileDir(env, 9341)).not.toBe(streamProfileDir(env, 9333));
    expect(streamTabsFile(env, 'vite-4311')).toBe(path.join(streamProfileDir(env, 9333), 'lam-tabs-vite-4311.json'));
  });

  test('флаги: headless, CDP-порт, профиль, фоновые вкладки не засыпают', () => {
    const args = streamBrowserArgs(9341, 'C:/p');
    expect(args).toContain('--headless=new');
    expect(args).toContain('--remote-debugging-port=9341');
    expect(args).toContain('--user-data-dir=C:/p');
    expect(args).toContain('--disable-renderer-backgrounding');
  });
});
