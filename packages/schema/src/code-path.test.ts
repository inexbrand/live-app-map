/**
 * Путь файла экрана от корня скана исходников.
 */
import { describe, expect, test } from 'bun:test';
import { codeFileOfNode } from './index';

describe('codeFileOfNode', () => {
  test('файл экрана переводится в путь от корня скана исходников', () => {
    expect(codeFileOfNode('/repo/apps/web', '/repo', 'src/App.tsx')).toBe('apps/web/src/App.tsx');
    expect(codeFileOfNode('/repo', '/repo', 'src/App.tsx')).toBe('src/App.tsx');
    expect(codeFileOfNode('/other', '/repo', 'src/App.tsx')).toBeNull();
  });
});
