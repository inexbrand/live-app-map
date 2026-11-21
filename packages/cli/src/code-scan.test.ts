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
      expect(result.document.nodes).toHaveLength(6);
      const parsed = parseAppMapDocument(JSON.parse(readFileSync(out, 'utf8')));
      if (!parsed.ok) {
        throw new Error(parsed.errors.map((e) => e.message).join('\n'));
      }
      expect(parsed.document.formatVersion).toBe(2);
      expect(parsed.document.code?.routes).toHaveLength(14);
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
      expect(live.document.code?.routes).toHaveLength(14);
      expect(live.document.pages.some((p) => p.type === 'service')).toBe(true);
    }));
});

describe('runScan --code-dir: экран → роуты', () => {
  test('экран Next внутри каталога исходников получает рёбра api к сервисам своих роутов', () =>
    withTmp(async (dir) => {
      const out = path.join(dir, 'web.json');
      const result = await runScan({ dir: path.join(SOURCE, 'apps/web'), codeDir: SOURCE, out });
      const doc = result.document;
      const routePath = new Map((doc.code?.routes ?? []).map((r) => [r.id, `${r.method} ${r.path}`]));
      const edges = doc.edges
        .filter((e) => e.kind === 'api')
        .map((e) => {
          const from = doc.nodes.find((n) => n.id === e.from)?.pathPattern;
          const ids = e.metadata?.['routeIds'];
          const routes = Array.isArray(ids) ? ids.map((id) => routePath.get(String(id))) : [];
          return `${from} → ${e.to}: ${routes.join(', ')}`;
        })
        .sort();
      expect(edges).toEqual([
        '/orders → service:@fx/api: GET /users/:id/posts, POST /users',
        '/orders → service:@fx/express: GET /v1/orders/count',
        '/orders → service:@fx/hono: POST /orders',
        '/users → service:@fx/api: DELETE /api/admin/users/:id, GET /api/users',
      ]);
      expect(doc.code?.screens?.map((s) => s.file).sort()).toEqual([
        'apps/web/src/app/orders/page.tsx',
        'apps/web/src/app/users/page.tsx',
      ]);
    }));
});

describe('bin code', () => {
  test('команда code печатает сводку и пишет файл', () =>
    withTmp((dir) => {
      const out = path.join(dir, 'code.json');
      const proc = Bun.spawnSync(['bun', 'run', BIN, 'code', '--dir', SOURCE, '-o', out]);
      expect(proc.exitCode).toBe(0);
      const summary: unknown = JSON.parse(proc.stdout.toString());
      expect(summary).toMatchObject({ ok: true, services: 6, routes: 14, routesWithDbInLoop: 1, tables: 4, out });
      const doc: unknown = JSON.parse(readFileSync(out, 'utf8'));
      const parsed = parseAppMapDocument(doc);
      if (!parsed.ok) {
        throw new Error('карта не прошла границу');
      }
      const calls = parsed.document.code?.apiCalls ?? [];
      expect(summary).toMatchObject({
        apiCalls: calls.length,
        apiCallsMatched: calls.filter((c) => c.routeId !== undefined).length,
      });
      expect(calls.length).toBeGreaterThan(0);
    }));
});