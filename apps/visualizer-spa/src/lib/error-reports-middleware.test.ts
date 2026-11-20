/**
 * POST /api/error-reports на настоящем HTTP-сервере.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { ErrorReportSource } from './error-report';
import { ERROR_REPORTS_FILE, createErrorReportsMiddleware } from './error-reports-middleware';

let lamDir = '';
let server: TestServer;
const logged: string[] = [];

beforeEach(async () => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-err-'));
  logged.length = 0;
  server = await serveMiddleware(createErrorReportsMiddleware({ lamDir, log: (l) => logged.push(l) }));
});
afterEach(() => server.close());

const report = {
  source: ErrorReportSource.BOUNDARY,
  message: 'Cannot read properties of undefined',
  stack: 'TypeError: ...\n at PageNode',
  componentStack: '\n at PageNode\n at AppMapCanvas',
  url: 'http://localhost:4310/?map=/maps/korbor-site.liveappmap.json',
  userAgent: 'test',
};

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${server.url}/api/error-reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('error-reports middleware', () => {
  test('отчёт сохраняется строкой JSONL и пишется в лог', async () => {
    const res = await post(JSON.stringify(report));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    await post(JSON.stringify({ ...report, message: 'second', source: ErrorReportSource.WINDOW }));
    const lines = readFileSync(path.join(lamDir, ERROR_REPORTS_FILE), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ id, ...report });
    expect(logged).toEqual([
      '[lam-error-report] boundary: Cannot read properties of undefined',
      '[lam-error-report] window: second',
    ]);
  });

  test('неверный отчёт → 400, не JSON → 400, ничего не пишется', async () => {
    expect((await post(JSON.stringify({ ...report, message: '' }))).status).toBe(400);
    expect((await post('{oops')).status).toBe(400);
    expect(existsSync(path.join(lamDir, ERROR_REPORTS_FILE))).toBe(false);
  });

  test('GET → 405, чужой origin → 403, большое тело → 413', async () => {
    const get = await fetch(`${server.url}/api/error-reports`);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    expect((await post(JSON.stringify(report), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(JSON.stringify(report), { origin: 'http://localhost:4310' })).status).toBe(201);
    expect((await post(JSON.stringify({ ...report, stack: 'x'.repeat(70_000) }))).status).toBe(413);
  });

  test('другие пути проходят дальше', async () => {
    expect(await (await fetch(`${server.url}/api/other`)).text()).toBe('next');
  });
});