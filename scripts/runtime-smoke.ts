#!/usr/bin/env bun
/**
 * Runtime smoke: CLI scan next-fixture (critical) + optional SPA :4310.
 *
 * - Critical: `live-app-map scan` по `fixtures/next-app-router-basic` → exit 0 и pages > 0.
 * - Optional: GET localhost:4310 — soft skip, если SPA не поднят (не hard-fail).
 * - Прочие live-URL (Korbor) — только warnings, чтобы smoke работал без dev-серверов.
 */
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const FIXTURE_NEXT = path.join(ROOT, 'fixtures', 'next-app-router-basic');
const CLI_BIN = path.join(ROOT, 'packages', 'cli', 'src', 'bin.ts');
/** База SPA; `LAM_SMOKE_SPA_BASE` — для soft-skip probe без живого :4310. */
const SPA_BASE = process.env['LAM_SMOKE_SPA_BASE'] ?? 'http://localhost:4310';

/** Опции fetch с Bun TLS (self-signed miniapp). */
type BunFetchInit = RequestInit & {
  readonly tls?: { readonly rejectUnauthorized?: boolean };
};

/** Итог одной optional HTTP-проверки. */
type HttpProbeKind = 'ok' | 'skip' | 'bad';

/** Сводка smoke для JSON в stdout. */
interface SmokeSummary {
  readonly scanOk: boolean;
  readonly pages: number;
  readonly spa: HttpProbeKind;
  readonly failedCritical: number;
  readonly warnings: number;
  readonly ok: boolean;
}

/**
 * Узкий type guard: plain object (не null / не array).
 */
function isPlainObject(value: unknown): value is { readonly [key: string]: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Парсит JSON-сводку CLI scan из stdout (корневой объект с полем pages).
 * Важно: first `{`, не last — иначе ломается на вложенном `timing: {…}`.
 */
function parseScanStdout(stdout: string): { pages: number; ok: boolean } | null {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // CLI печатает один JSON-блок; берём от первого `{` до последнего `}`.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const raw: unknown = JSON.parse(trimmed.slice(start, end + 1));
    if (!isPlainObject(raw)) {
      return null;
    }
    const pages = raw['pages'];
    const okFlag = raw['ok'];
    if (typeof pages !== 'number' || !Number.isFinite(pages)) {
      return null;
    }
    return {
      pages,
      ok: okFlag === true || (okFlag !== false && pages > 0),
    };
  } catch {
    return null;
  }
}

/**
 * Critical path: CLI scan next fixture → pages > 0.
 */
async function smokeScanFixture(): Promise<{
  ok: boolean;
  pages: number;
  exitCode: number;
  detail: string;
}> {
  const proc = Bun.spawn(
    [
      process.execPath,
      CLI_BIN,
      'scan',
      '--dir',
      FIXTURE_NEXT,
      '--framework',
      'next',
      '--base-url',
      'http://localhost:3000',
    ],
    {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const parsed = parseScanStdout(stdout);
  if (parsed === null) {
    const snippet = (stdout || stderr).trim().slice(0, 200);
    return {
      ok: false,
      pages: 0,
      exitCode,
      detail: `не разобрали JSON scan (exit=${exitCode}): ${snippet}`,
    };
  }

  const ok = exitCode === 0 && parsed.pages > 0;
  return {
    ok,
    pages: parsed.pages,
    exitCode,
    detail: ok
      ? `pages=${parsed.pages}`
      : `exit=${exitCode} pages=${parsed.pages} ok=${String(parsed.ok)}`,
  };
}

/**
 * Optional HTTP probe: connection refused / timeout → skip (soft).
 */
async function probeHttp(
  url: string,
  timeoutMs: number,
): Promise<{ kind: HttpProbeKind; status?: number; message?: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const init: BunFetchInit = {
      signal: ac.signal,
      tls: { rejectUnauthorized: false },
    };
    const res = await fetch(url, init);
    const good = res.status >= 200 && res.status < 500;
    if (good) {
      return { kind: 'ok', status: res.status };
    }
    return { kind: 'bad', status: res.status, message: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Отсутствующий сервер / abort / DNS / Bun «Unable to connect» — soft skip.
    const soft =
      /ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|fetch failed|AbortError|timed out|The operation was aborted|Unable to connect|Unable to connect\.|NetworkError|Failed to fetch/i.test(
        msg,
      );
    if (soft) {
      return { kind: 'skip', message: msg.slice(0, 120) };
    }
    return { kind: 'bad', message: msg.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  let failedCritical = 0;
  let warnings = 0;

  // --- 1) Critical: CLI scan next fixture ---
  console.log('--- scan fixture (critical) ---');
  console.log('DIR', FIXTURE_NEXT);
  const scan = await smokeScanFixture();
  if (scan.ok) {
    console.log('OK scan', scan.detail);
  } else {
    console.log('FAIL scan', scan.detail);
    failedCritical++;
  }

  // --- 2) Optional: SPA :4310 (soft skip if down) ---
  console.log('--- spa optional (:4310) ---');
  const spaUrls = [
    `${SPA_BASE}/`,
    `${SPA_BASE}/maps/korbor-miniapp.liveappmap.json`,
    `${SPA_BASE}/maps/korbor-admin.liveappmap.json`,
    `${SPA_BASE}/maps/korbor-site.liveappmap.json`,
  ];

  let spaKind: HttpProbeKind = 'skip';
  let spaAnyOk = false;
  let spaAnyBad = false;

  for (const url of spaUrls) {
    const r = await probeHttp(url, 4000);
    if (r.kind === 'ok') {
      spaAnyOk = true;
      console.log('OK', r.status, url);
    } else if (r.kind === 'skip') {
      console.log('SKIP', url, r.message ?? 'down');
    } else {
      spaAnyBad = true;
      warnings++;
      console.log('WARN', url, r.message ?? r.status);
    }
  }

  if (spaAnyOk) {
    spaKind = 'ok';
  } else if (spaAnyBad) {
    spaKind = 'bad';
  } else {
    spaKind = 'skip';
    console.log('SKIP spa: visualizer не слушает :4310 (soft)');
  }

  // --- 3) Optional Korbor live surfaces (warnings only) ---
  console.log('--- korbor live (optional) ---');
  const liveOptional = [
    'http://localhost:16002/',
    'http://localhost:16002/vacancies',
    'https://vite.localhost:5175/',
    'https://vite.localhost:5175/feed?lam_role=recruiter',
    'https://vite.localhost:5175/employer/create?lam_role=employer',
    'http://localhost:16001/',
  ];

  for (const url of liveOptional) {
    const r = await probeHttp(url, 4000);
    if (r.kind === 'ok') {
      console.log('OK', r.status, url);
    } else if (r.kind === 'skip') {
      console.log('SKIP', url, r.message ?? 'down');
    } else {
      warnings++;
      console.log('WARN', url, r.message ?? r.status);
    }
  }

  const summary: SmokeSummary = {
    scanOk: scan.ok,
    pages: scan.pages,
    spa: spaKind,
    failedCritical,
    warnings,
    ok: failedCritical === 0,
  };

  console.log(JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

await main();
