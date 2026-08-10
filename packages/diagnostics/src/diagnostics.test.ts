import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from '@live-app-map/schema';
import {
  diag,
  formatDiagnostic,
  getCatalog,
  sortDiagnostics,
  type DiagnosticCode,
} from './index';

/** Все коды union — для exhaustiveness-проверки каталога. */
const ALL_CODES: readonly DiagnosticCode[] = [
  'AMBIGUOUS_APP_DIR',
  'HYBRID_ROUTER',
  'MISSING_EXAMPLE_PARAM',
  'UNRESOLVED_TARGET',
  'DYNAMIC_HREF',
  'EDGE_SCAN_TRUNCATED',
  'PARALLEL_LIVE_LIMITATION',
  'PIN_DEFERRED',
  'NO_APP_DIR',
  'NO_ROUTES_FOUND',
  'INVALID_BASE_URL',
  'FRAMEWORK_AUTO_DETECT',
  'DANGLING_EDGE',
  'DUPLICATE_NODE_ID',
  'SCAN_OK',
];

const SEVERITIES = new Set(['error', 'warning', 'info']);

/** Есть кириллица — human-readable RU message/title. */
function hasCyrillic(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text);
}

describe('CATALOG', () => {
  test('каждый DiagnosticCode имеет severity + title + hint', () => {
    const catalog = getCatalog();
    const catalogKeys = Object.keys(catalog).sort();
    const expectedKeys = [...ALL_CODES].sort();

    expect(catalogKeys).toEqual(expectedKeys);

    for (const code of ALL_CODES) {
      const entry = catalog[code];
      expect(SEVERITIES.has(entry.severity)).toBe(true);
      expect(typeof entry.title).toBe('string');
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(typeof entry.hint).toBe('string');
      expect(entry.hint.trim().length).toBeGreaterThan(0);
      expect(hasCyrillic(entry.title)).toBe(true);
    }
  });
});

describe('diag', () => {
  test('берёт severity/message/hint из каталога', () => {
    const d = diag('NO_APP_DIR');
    const meta = getCatalog().NO_APP_DIR;
    expect(d.code).toBe('NO_APP_DIR');
    expect(d.severity).toBe(meta.severity);
    expect(d.message).toBe(meta.title);
    expect(d.hint).toBe(meta.hint);
  });

  test('overrides перекрывают message/path/severity/hint', () => {
    const d = diag('SCAN_OK', {
      message: 'Кастомное сообщение',
      path: '/dashboard',
      severity: 'warning',
      hint: 'Свой hint',
    });
    expect(d.message).toBe('Кастомное сообщение');
    expect(d.path).toBe('/dashboard');
    expect(d.severity).toBe('warning');
    expect(d.hint).toBe('Свой hint');
  });
});

describe('formatDiagnostic', () => {
  test('включает code + path + message (human RU)', () => {
    const d = diag('UNRESOLVED_TARGET', { path: '/jobs/[id]' });
    const line = formatDiagnostic(d);

    expect(line).toContain('UNRESOLVED_TARGET');
    expect(line).toContain('/jobs/[id]');
    expect(line).toContain(d.message);
    expect(hasCyrillic(line)).toBe(true);
    // severity подпись по-русски
    expect(line).toMatch(/^\[предупреждение\]/);
  });

  test('file имеет приоритет над path в локации', () => {
    const d: Diagnostic = {
      code: 'DYNAMIC_HREF',
      severity: 'info',
      message: 'Динамический href',
      path: '/x',
      file: 'src/App.tsx',
    };
    const line = formatDiagnostic(d);
    expect(line).toContain('src/App.tsx');
    expect(line).not.toContain(' /x');
    expect(line).toMatch(/^\[инфо\]/);
  });

  test('error severity → русская метка «ошибка»', () => {
    const line = formatDiagnostic(diag('NO_ROUTES_FOUND'));
    expect(line).toMatch(/^\[ошибка\] NO_ROUTES_FOUND: /);
    expect(hasCyrillic(line)).toBe(true);
  });
});

describe('sortDiagnostics', () => {
  test('error → warning → info, затем code', () => {
    const list: Diagnostic[] = [
      diag('SCAN_OK'),
      diag('UNRESOLVED_TARGET'),
      diag('NO_APP_DIR'),
      diag('HYBRID_ROUTER'),
      diag('DANGLING_EDGE'),
      diag('NO_ROUTES_FOUND'),
    ];

    const sorted = sortDiagnostics(list);
    const severities = sorted.map((d) => d.severity);

    // error before warning before info
    const firstWarning = severities.indexOf('warning');
    const firstInfo = severities.indexOf('info');
    const lastError = severities.lastIndexOf('error');

    expect(lastError).toBeLessThan(firstWarning);
    expect(firstWarning).toBeLessThan(firstInfo);

    // внутри severity — lex code
    const errors = sorted.filter((d) => d.severity === 'error').map((d) => d.code);
    expect(errors).toEqual([...errors].sort((a, b) => a.localeCompare(b)));

    const warnings = sorted.filter((d) => d.severity === 'warning').map((d) => d.code);
    expect(warnings).toEqual([...warnings].sort((a, b) => a.localeCompare(b)));

    const infos = sorted.filter((d) => d.severity === 'info').map((d) => d.code);
    expect(infos).toEqual([...infos].sort((a, b) => a.localeCompare(b)));
  });

  test('не мутирует исходный массив', () => {
    const list = [diag('SCAN_OK'), diag('NO_APP_DIR')];
    const copy = [...list];
    sortDiagnostics(list);
    expect(list.map((d) => d.code)).toEqual(copy.map((d) => d.code));
  });
});
