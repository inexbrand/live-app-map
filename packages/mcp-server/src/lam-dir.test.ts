/**
 * resolveLamDir: одна папка обмена для vite (apps/…), stdio MCP и CLI.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LAM_DIR_NAME, resolveLamDir } from './lam-dir';

describe('resolveLamDir', () => {
  test('из вложенного пакета находит корень монорепо', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lam-root-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
    const app = path.join(root, 'apps', 'visualizer-spa');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'spa' }));
    expect(resolveLamDir(app, undefined)).toBe(path.join(root, LAM_DIR_NAME));
    expect(resolveLamDir(root, undefined)).toBe(path.join(root, LAM_DIR_NAME));
  });

  test('без монорепо — папка в start', () => {
    const lone = mkdtempSync(path.join(tmpdir(), 'lam-lone-'));
    expect(resolveLamDir(lone, undefined)).toBe(path.join(lone, LAM_DIR_NAME));
  });

  test('LAM_FEEDBACK_DIR важнее поиска', () => {
    expect(resolveLamDir('/', '/tmp/lam-x')).toBe(path.resolve('/tmp/lam-x'));
  });
});
