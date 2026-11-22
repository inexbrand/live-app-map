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
export type HttpProbeKind = 'ok' | 'skip' | 'bad';

/** Сводка smoke для JSON в stdout. */
export interface SmokeSummary {
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
export function isPlainObject(value: unknown): value is { readonly [key: string]: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Парсит JSON-сводку CLI scan из stdout (корневой объект с полем pages).
 * Важно: first `{`, не last — иначе ломается на вложенном `timing: {…}`.
 */
export function parseScanStdout(stdout: string): { pages: number; ok: boolean } | null {
  const block = jsonBlock(stdout);
  if (block === undefined) {
    return null;
  }
  try {
    return scanSummary(JSON.parse(block));
  } catch {
    return null;
  }
}

/** CLI печатает один JSON-блок: от первого `{` до последнего `}`. */
function jsonBlock(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start < 0 || end <= start ? undefined : trimmed.slice(start, end + 1);
}

/** Число страниц и флаг ok сводки; нет числа pages — null. */
function scanSummary(raw: unknown): { pages: number; ok: boolean } | null {
  const pages = isPlainObject(raw) ? raw['pages'] : undefined;
  if (!isPlainObject(raw) || typeof pages !== 'number' || !Number.isFinite(pages)) {
    return null;
  }
  const okFlag = raw['ok'];
  return { pages, ok: okFlag === true || (okFlag !== false && pages > 0) };
}

/**
 * Critical path: CLI scan next fixture → pages > 0.
 */
export async function smokeScanFixture(): Promise<{
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
export async function probeHttp(
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
    return res.status >= 200 && res.status < 500 ? { kind: 'ok', status: res.status } : { kind: 'bad', status: res.status, message: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: isSoftError(msg) ? 'skip' : 'bad', message: msg.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/** Отсутствующий сервер / abort / DNS / Bun «Unable to connect» — soft skip. */
function isSoftError(msg: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|fetch failed|AbortError|timed out|The operation was aborted|Unable to connect|Unable to connect\.|NetworkError|Failed to fetch/i.test(msg);
}

/** Итог серии проверок. */
export type ProbeTally = { readonly anyOk: boolean; readonly anyBad: boolean; readonly warnings: number };

/** Проверяет адреса по очереди и печатает OK / SKIP / WARN. */
async function probeAll(urls: readonly string[]): Promise<ProbeTally> {
  const kinds: HttpProbeKind[] = [];
  for (const url of urls) {
    const r = await probeHttp(url, 4000);
    console.log(...probeLine(r, url));
    kinds.push(r.kind);
  }
  return tallyOf(kinds);
}

/** Строка лога проверки. */
export function probeLine(r: { kind: HttpProbeKind; status?: number; message?: string }, url: string): unknown[] {
  if (r.kind === 'ok') {
    return ['OK', r.status, url];
  }
  return r.kind === 'skip' ? ['SKIP', url, r.message ?? 'down'] : ['WARN', url, r.message ?? r.status];
}

/**
 * Сводка серии проверок: был ли ответ, была ли ошибка, число предупреждений.
 *
 * @param kinds - итоги проверок
 * @returns сводка
 */
export function tallyOf(kinds: readonly HttpProbeKind[]): ProbeTally {
  return { anyOk: kinds.includes('ok'), anyBad: kinds.includes('bad'), warnings: kinds.filter((k) => k === 'bad').length };
}

/**
 * Состояние SPA по сводке: ответил хоть один адрес — ok, иначе ошибка — bad, иначе skip.
 *
 * @param t - сводка проверок SPA
 * @returns состояние
 */
export function spaKindOf(t: ProbeTally): HttpProbeKind {
  if (t.anyOk) {
    return 'ok';
  }
  return t.anyBad ? 'bad' : 'skip';
}

async function main(): Promise<void> {
  // --- 1) Critical: CLI scan next fixture ---
  console.log('--- scan fixture (critical) ---');
  console.log('DIR', FIXTURE_NEXT);
  const scan = await smokeScanFixture();
  console.log(scanLabel(scan.ok), scan.detail);

  // --- 2) Optional: SPA :4310 (soft skip if down) ---
  console.log('--- spa optional (:4310) ---');
  const spa = await probeAll([
    `${SPA_BASE}/`,
    `${SPA_BASE}/maps/korbor-miniapp.liveappmap.json`,
    `${SPA_BASE}/maps/korbor-admin.liveappmap.json`,
    `${SPA_BASE}/maps/korbor-site.liveappmap.json`,
  ]);
  logSpaSkip(spaKindOf(spa));

  // --- 3) Optional Korbor live surfaces (warnings only) ---
  console.log('--- korbor live (optional) ---');
  const live = await probeAll([
    'http://localhost:16002/',
    'http://localhost:16002/vacancies',
    'https://vite.localhost:5175/',
    'https://vite.localhost:5175/feed?lam_role=recruiter',
    'https://vite.localhost:5175/employer/create?lam_role=employer',
    'http://localhost:16001/',
  ]);

  const summary = summaryOf(scan, spa, live);
  console.log(JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

/** Метка итога скана в логе. */
function scanLabel(ok: boolean): string {
  return ok ? 'OK scan' : 'FAIL scan';
}

/** SPA не поднят — мягкий пропуск. */
function logSpaSkip(kind: HttpProbeKind): void {
  if (kind === 'skip') {
    console.log('SKIP spa: visualizer не слушает :4310 (soft)');
  }
}

/**
 * Сводка smoke: провал — только критичный скан; предупреждения — ошибки SPA и Korbor.
 *
 * @param scan - итог скана фикстуры
 * @param spa - проверки SPA
 * @param live - проверки живых поверхностей Korbor
 * @returns сводка для stdout
 */
export function summaryOf(scan: { readonly ok: boolean; readonly pages: number }, spa: ProbeTally, live: ProbeTally): SmokeSummary {
  const failedCritical = scan.ok ? 0 : 1;
  return {
    scanOk: scan.ok,
    pages: scan.pages,
    spa: spaKindOf(spa),
    failedCritical,
    warnings: spa.warnings + live.warnings,
    ok: failedCritical === 0,
  };
}

if (import.meta.main) {
  await main();
}
