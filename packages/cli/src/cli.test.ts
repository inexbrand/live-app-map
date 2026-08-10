/**
 * Unit-тесты CLI API: runScan / runDiff / runDoctor / format roundtrip.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appMapToLiveAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
  type AppMapDocument,
} from '@live-app-map/schema';
import { runDiff, runDoctor, runScan } from './index';

const FIXTURE_NEXT = path.resolve(
  import.meta.dir,
  '../../../fixtures/next-app-router-basic',
);

function minimalDoc(
  partial: Partial<AppMapDocument> &
    Pick<AppMapDocument, 'nodes' | 'edges' | 'revision'>,
): AppMapDocument {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'cli-test', version: '0' },
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:3000',
    ...partial,
  };
}

describe('runScan', () => {
  test('next-app-router-basic: pages≥3, diagnostics, timing', async () => {
    const result = await runScan({
      dir: FIXTURE_NEXT,
      baseUrl: 'http://localhost:3000',
      exampleParams: { id: 'demo' },
    });
    const pages = result.document.nodes.filter((n) => n.kind === 'page');
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.timing).toBeDefined();
    expect(typeof result.timing.totalMs).toBe('number');
    expect(typeof result.timing.discoverMs).toBe('number');
    expect(typeof result.timing.edgesMs).toBe('number');
    expect(result.document.project.framework).toBe('next');
  });

  test('format enterprise|liveappmap: write + parse roundtrip', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'lam-cli-'));
    try {
      const enterpriseOut = path.join(tmp, 'map.enterprise.json');
      const liveOut = path.join(tmp, 'map.liveappmap.json');

      const enterpriseResult = await runScan({
        dir: FIXTURE_NEXT,
        baseUrl: 'http://localhost:3000',
        exampleParams: { id: 'demo' },
        out: enterpriseOut,
        format: 'enterprise',
      });
      const enterpriseRaw = JSON.parse(
        await Bun.file(enterpriseOut).text(),
      ) as unknown;
      const enterpriseParsed = parseAppMapDocument(enterpriseRaw);
      expect(enterpriseParsed.ok).toBe(true);
      if (enterpriseParsed.ok) {
        expect(
          enterpriseParsed.document.nodes.filter((n) => n.kind === 'page')
            .length,
        ).toBeGreaterThanOrEqual(3);
        expect(enterpriseParsed.document.revision).toBe(
          enterpriseResult.document.revision,
        );
      }

      await runScan({
        dir: FIXTURE_NEXT,
        baseUrl: 'http://localhost:3000',
        exampleParams: { id: 'demo' },
        out: liveOut,
        format: 'liveappmap',
      });
      const liveRaw = JSON.parse(await Bun.file(liveOut).text()) as unknown;
      const liveParsed = parseLiveAppMapDocument(liveRaw);
      expect(liveParsed.ok).toBe(true);
      if (liveParsed.ok) {
        expect(liveParsed.document.pages.length).toBeGreaterThanOrEqual(3);
      }

      // in-memory convert roundtrip: enterprise → liveappmap → parse
      const liveFromMem = appMapToLiveAppMap(enterpriseResult.document);
      const reparse = parseLiveAppMapDocument(liveFromMem);
      expect(reparse.ok).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('unknown framework dual-scan: FRAMEWORK_AUTO_DETECT + stable tie-break', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'lam-unknown-'));
    try {
      // пустой пакет без next/rr маркеров → framework=unknown
      writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({ name: 'empty-unknown', private: true }),
        'utf8',
      );

      const a = await runScan({ dir: tmp, framework: 'auto' });
      const b = await runScan({ dir: tmp, framework: 'auto' });

      const codesA = a.diagnostics.map((d) => d.code);
      expect(codesA).toContain('FRAMEWORK_AUTO_DETECT');
      // scanner'ы сигналят отсутствие маршрутов
      expect(codesA).toContain('NO_ROUTES_FOUND');

      // стабильность: два прогона → один и тот же framework (deterministic)
      expect(a.document.project.framework).toBe(b.document.project.framework);
      expect(
        a.document.project.framework === 'next' ||
          a.document.project.framework === 'react-router',
      ).toBe(true);

      const autoMsg = a.diagnostics.find(
        (d) => d.code === 'FRAMEWORK_AUTO_DETECT',
      )?.message;
      expect(autoMsg).toBeDefined();
      expect(autoMsg).toContain('dual-scan');
      expect(autoMsg).toContain('next=');
      expect(autoMsg).toContain('react-router=');
      expect(autoMsg).toContain('tie-break:');
      // message кодирует scores обоих кандидатов (не silent page-count only)
      expect(autoMsg).toMatch(/next=\d+/);
      expect(autoMsg).toMatch(/react-router=\d+/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('unknown dual-scan: больше pages побеждает (не silent only-count)', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'lam-unknown-pages-'));
    try {
      writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({ name: 'unknown-with-app', private: true }),
        'utf8',
      );
      // app/page.tsx без next.config — detectFramework → next (hasApp && !hasRR)
      // force unknown via explicit path: no app, но src с page-like? Лучше framework: 'unknown' через dual
      // detect: hasApp alone → next. Чтобы попасть в dual, не создаём app/pages/rr.
      // Добавим только случайный файл — dual path + 0 pages уже покрыт.
      // Здесь: явный framework unknown через detect — empty dir already.
      // Доп. кейс: force dual by scanning with framework that falls to dual is internal.
      // Проверяем явный framework: 'unknown' не в ScanCliOptions union как отдельный путь
      // opts.framework FrameworkKind | 'auto' — FrameworkKind includes 'unknown'.
      mkdirSync(path.join(tmp, 'app'), { recursive: true });
      writeFileSync(
        path.join(tmp, 'app', 'page.tsx'),
        'export default function Home(){return null}\n',
        'utf8',
      );
      // has app → detect next, not dual. Force dual with framework: 'unknown'
      const result = await runScan({
        dir: tmp,
        framework: 'unknown',
        baseUrl: 'http://localhost:3000',
      });
      const codes = result.diagnostics.map((d) => d.code);
      expect(codes).toContain('FRAMEWORK_AUTO_DETECT');
      expect(result.document.project.framework).toBe('next');
      const pages = result.document.nodes.filter((n) => n.kind === 'page');
      expect(pages.length).toBeGreaterThanOrEqual(1);
      const auto = result.diagnostics.find(
        (d) => d.code === 'FRAMEWORK_AUTO_DETECT',
      );
      expect(auto?.message).toContain('next=');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('runDiff', () => {
  test('changed → AppMapDiff shape (nodes.added)', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'lam-diff-'));
    try {
      const left = minimalDoc({
        revision: 'L',
        nodes: [
          { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
        ],
        edges: [],
      });
      const right = minimalDoc({
        revision: 'R',
        nodes: [
          { id: 'a', kind: 'page', title: 'A', pathPattern: '/a' },
          { id: 'b', kind: 'page', title: 'B', pathPattern: '/b' },
        ],
        edges: [
          {
            id: 'e1',
            from: 'a',
            to: 'b',
            kind: 'link',
            confidence: 'high',
          },
        ],
      });
      const leftPath = path.join(tmp, 'left.json');
      const rightPath = path.join(tmp, 'right.json');
      writeFileSync(leftPath, JSON.stringify(left), 'utf8');
      writeFileSync(rightPath, JSON.stringify(right), 'utf8');

      const d = runDiff(leftPath, rightPath);
      expect(d.formatVersion).toBe(1);
      expect(d.leftRevision).toBe('L');
      expect(d.rightRevision).toBe('R');
      expect(d.nodes.added).toEqual(['b']);
      expect(d.nodes.removed).toEqual([]);
      expect(Array.isArray(d.nodes.changed)).toBe(true);
      expect(d.edges.added).toEqual(['e1']);
      expect(Array.isArray(d.edges.removed)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('runDoctor', () => {
  test('next fixture: hasPackageJson / framework / notes', () => {
    const report = runDoctor(FIXTURE_NEXT);
    expect(report.hasPackageJson).toBe(true);
    expect(report.framework).toBe('next');
    expect(report.hasAppDir).toBe(true);
    expect(Array.isArray(report.notes)).toBe(true);
    expect(report.notes.some((n) => n.includes('framework='))).toBe(true);
    expect(report.dir).toBe(path.resolve(FIXTURE_NEXT));
  });

  test('empty dir: unknown + note', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'lam-doctor-'));
    try {
      const report = runDoctor(tmp);
      expect(report.framework).toBe('unknown');
      expect(report.hasPackageJson).toBe(false);
      expect(
        report.notes.some((n) => n.includes('framework не определён')),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
