/**
 * CLI: скан исходников (`code`) и `scan --code-dir` на настоящих фикстурах.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseAppMapDocument, parseLiveAppMapJson } from '@live-app-map/schema';
import { runCodeScan, runScan } from './index';

const FIXTURES = path.resolve(import.meta.dir, '../../../fixtures');
const SOURCE = path.join(FIXTURES, 'source-monorepo');
const NEXT = path.join(FIXTURES, 'next-app-router-basic');
const BIN = path.resolve(import.meta.dir, 'bin.ts');

/** Временный каталог на время теста. */
function withTmp(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'lam-code-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('runCodeScan', () => {
  test('карта только из исходников: ноды service + раздел code, файл проходит границу', () =>
    withTmp((dir) => {
      const out = path.join(dir, 'code.json');
      const result = runCodeScan({ dir: SOURCE, out });
      expect(result.document.nodes.every((n) => n.kind === 'service')).toBe(true);
      expect(result.document.nodes).toHaveLength(5);
      const parsed = parseAppMapDocument(JSON.parse(readFileSync(out, 'utf8')));
      if (!parsed.ok) {
        throw new Error(parsed.errors.map((e) => e.message).join('\n'));
      }
      expect(parsed.document.formatVersion).toBe(2);
      expect(parsed.document.code?.routes).toHaveLength(9);
      expect(parsed.document.code?.root).toBe(SOURCE);
    }));
});

describe('runScan --code-dir', () => {
  test('экраны Next + сервисы и code из другого каталога, viewer-формат сохраняет code', () =>
    withTmp(async (dir) => {
      const out = path.join(dir, 'map.liveappmap.json');
      const result = await runScan({ dir: NEXT, codeDir: SOURCE, out, format: 'liveappmap' });
      const kinds = new Set(result.document.nodes.map((n) => n.kind));
      expect(kinds.has('page')).toBe(true);
      expect(kinds.has('service')).toBe(true);
      expect(result.document.code?.tables.map((t) => t.exportName).sort()).toEqual([
        'Order',
        'comments',
        'posts',
        'users',
      ]);
      const live = parseLiveAppMapJson(readFileSync(out, 'utf8'));
      if (!live.ok) {
        throw new Error(live.errors.map((e) => e.message).join('\n'));
      }
      expect(live.document.code?.routes).toHaveLength(9);
      expect(live.document.pages.some((p) => p.type === 'service')).toBe(true);
    }));
});

describe('bin code', () => {
  test('команда code печатает сводку и пишет файл', () =>
    withTmp((dir) => {
      const out = path.join(dir, 'code.json');
      const proc = Bun.spawnSync(['bun', 'run', BIN, 'code', '--dir', SOURCE, '-o', out]);
      expect(proc.exitCode).toBe(0);
      const summary: unknown = JSON.parse(proc.stdout.toString());
      expect(summary).toMatchObject({ ok: true, services: 5, routes: 9, tables: 4, out });
    }));
});
