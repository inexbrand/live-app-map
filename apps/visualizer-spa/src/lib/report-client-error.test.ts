/**
 * Клиентский отправитель отчётов против настоящего middleware.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ErrorReportSource } from './error-report';
import { ERROR_REPORTS_FILE, createErrorReportsMiddleware } from './error-reports-middleware';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { MAX_REPORTS_PER_PAGE, buildErrorReport, createErrorReporter } from './report-client-error';

let lamDir = '';
let server: TestServer;
let fetchToServer: typeof fetch;
beforeEach(async () => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-client-err-'));
  server = await serveMiddleware(createErrorReportsMiddleware({ lamDir, log: () => undefined }));
  const fn = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    fetch(`${server.url}${String(input)}`, init);
  fetchToServer = Object.assign(fn, { preconnect: fetch.preconnect });
});
afterEach(() => server.close());

describe('buildErrorReport', () => {
  test('Error, строка и пустое значение', () => {
    const e = new TypeError('x is undefined');
    const r = buildErrorReport({ source: ErrorReportSource.WINDOW, error: e }, 'http://localhost:4310/', 'ua');
    expect(r.message).toBe('TypeError: x is undefined');
    expect(r.stack).toContain('x is undefined');
    expect(buildErrorReport({ source: ErrorReportSource.REJECTION, error: 'boom' }, 'u', 'ua')).toMatchObject({ message: 'boom', stack: null });
    expect(buildErrorReport({ source: ErrorReportSource.REJECTION, error: '' }, 'u', 'ua').message).toBe('пустая ошибка');
  });
});

describe('createErrorReporter', () => {
  test('отчёт доходит до файла; повтор той же ошибки не отправляется', async () => {
    const send = createErrorReporter(fetchToServer);
    const report = buildErrorReport({ source: ErrorReportSource.BOUNDARY, error: new Error('render'), componentStack: '\n at App' }, 'http://x/', 'ua');
    expect(await send(report)).toBe(true);
    expect(await send(report)).toBe(false);
    const lines = readFileSync(path.join(lamDir, ERROR_REPORTS_FILE), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ source: 'boundary', message: 'Error: render', componentStack: '\n at App' });
  });

  test('не больше MAX_REPORTS_PER_PAGE за страницу', async () => {
    const send = createErrorReporter(fetchToServer);
    let sent = 0;
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i += 1) {
      if (await send(buildErrorReport({ source: ErrorReportSource.WINDOW, error: `e${i}` }, 'u', 'ua'))) {
        sent += 1;
      }
    }
    expect(sent).toBe(MAX_REPORTS_PER_PAGE);
  });
});
