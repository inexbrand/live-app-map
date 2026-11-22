/**
 * Путь файла экрана от корня скана исходников.
 */
import { describe, expect, test } from 'bun:test';
import { codeFileOfNode } from './index';
import { screenOf } from './code-path';
import type { CodeModel } from './index';

describe('codeFileOfNode', () => {
  test('файл экрана переводится в путь от корня скана исходников', () => {
    expect(codeFileOfNode('/repo/apps/web', '/repo', 'src/App.tsx')).toBe('apps/web/src/App.tsx');
    expect(codeFileOfNode('/repo', '/repo', 'src/App.tsx')).toBe('src/App.tsx');
    expect(codeFileOfNode('/other', '/repo', 'src/App.tsx')).toBeNull();
  });
});

describe('screenOf', () => {
  const code = {
    root: '.',
    services: [],
    symbols: [],
    routes: [],
    tables: [],
    screens: [
      { file: 'src/Feed.tsx', calls: [] },
      { nodeId: 'route:/feed', file: 'src/FeedPage.tsx', calls: [] },
    ],
  } satisfies CodeModel;

  test('по ноде, иначе по файлу у экрана без ноды; нет экранов — undefined', () => {
    expect(screenOf(code, 'route:/feed', 'x')?.file).toBe('src/FeedPage.tsx');
    expect(screenOf(code, 'route:/other', 'src/Feed.tsx')?.file).toBe('src/Feed.tsx');
    expect(screenOf(code, 'route:/other', 'src/FeedPage.tsx')).toBeUndefined();
    expect(screenOf({ ...code, screens: undefined }, 'route:/feed', 'src/Feed.tsx')).toBeUndefined();
  });
});
