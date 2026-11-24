/**
 * Runtime smoke на реальных функциях: разбор вывода CLI, HTTP-проверки, итог,
 * скан фикстуры CLI; обёртка scan-korbor — каталог korbor.
 */
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPlainObject, parseScanStdout, probeHttp, probeLine, smokeScanFixture, spaKindOf, summaryOf, tallyOf } from './runtime-smoke';
import { korborDir } from './scan-korbor';

describe('runtime smoke', () => {
  test('probeLine и summaryOf: строки лога и итог', () => {
    expect(probeLine({ kind: 'ok', status: 200 }, 'u')).toEqual(['OK', 200, 'u']);
    expect(probeLine({ kind: 'skip' }, 'u')).toEqual(['SKIP', 'u', 'down']);
    expect(probeLine({ kind: 'bad', status: 503 }, 'u')).toEqual(['WARN', 'u', 503]);
    expect(probeLine({ kind: 'bad', message: 'HTTP 500' }, 'u')).toEqual(['WARN', 'u', 'HTTP 500']);
    const spa = tallyOf(['bad']);
    const live = tallyOf(['bad', 'ok']);
    expect(summaryOf({ ok: true, pages: 4 }, spa, live)).toEqual({ scanOk: true, pages: 4, spa: 'bad', failedCritical: 0, warnings: 2, ok: true });
    expect(summaryOf({ ok: false, pages: 0 }, spa, live).ok).toBe(false);
  });

  test('parseScanStdout: первый «{» до последнего «}», ok по флагу или по страницам', () => {
    expect(parseScanStdout('лог\n{"pages":3,"timing":{"ms":1}}\n')).toEqual({ pages: 3, ok: true });
    expect(parseScanStdout('{"pages":0}')).toEqual({ pages: 0, ok: false });
    expect(parseScanStdout('{"pages":2,"ok":false}')).toEqual({ pages: 2, ok: false });
    expect(parseScanStdout('{"pages":"3"}')).toBeNull();
    expect(parseScanStdout('[1]')).toBeNull();
    expect(parseScanStdout('{сломано}')).toBeNull();
    expect(parseScanStdout('   ')).toBeNull();
  });

  test('сводка проверок и состояние SPA', () => {
    expect(tallyOf(['skip', 'bad', 'bad'])).toEqual({ anyOk: false, anyBad: true, warnings: 2 });
    expect(spaKindOf(tallyOf(['bad', 'ok']))).toBe('ok');
    expect(spaKindOf(tallyOf(['bad', 'skip']))).toBe('bad');
    expect(spaKindOf(tallyOf(['skip']))).toBe('skip');
  });

  test('probeHttp: 2xx–4xx — ok, 5xx — bad, нет сервера — skip', async () => {
    const server = Bun.serve({ port: 0, fetch: (req) => new Response('', { status: new URL(req.url).pathname === '/down' ? 503 : 404 }) });
    try {
      expect(await probeHttp(`http://localhost:${server.port}/`, 2000)).toEqual({ kind: 'ok', status: 404 });
      expect(await probeHttp(`http://localhost:${server.port}/down`, 2000)).toEqual({ kind: 'bad', status: 503, message: 'HTTP 503' });
    } finally {
      server.stop(true);
    }
    expect((await probeHttp('http://127.0.0.1:1/', 2000)).kind).toBe('skip');
  });

  test('smokeScanFixture: CLI сканирует фикстуру Next', async () => {
    const r = await smokeScanFixture();
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.pages).toBeGreaterThan(0);
  }, 60_000);
});

describe('границы smoke', () => {
  test('isPlainObject и parseScanStdout: null, массив, «}» до «{», одна страница — ok, нечисловое pages', () => {
    expect([isPlainObject(null), isPlainObject([]), isPlainObject('x'), isPlainObject({})]).toEqual([false, false, false, true]);
    expect(parseScanStdout('} {')).toBeNull();
    expect(parseScanStdout('{')).toBeNull();
    expect(parseScanStdout('{"pages":1}')).toEqual({ pages: 1, ok: true });
    expect(parseScanStdout('{"pages":0,"ok":true}')).toEqual({ pages: 0, ok: true });
    expect(parseScanStdout('{"pages":1e999}')).toBeNull();
    expect(parseScanStdout('null {"x":1}')).toBeNull();
  });

  test('probeHttp: 200 и 499 — ok, 500 — bad; самоподписанный HTTPS принимается; текст ошибки — как у fetch', async () => {
    const server = Bun.serve({ port: 0, fetch: (req) => new Response('', { status: Number(new URL(req.url).pathname.slice(1)) }) });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lam-tls-'));
    const [key, cert] = [path.join(dir, 'key.pem'), path.join(dir, 'cert.pem')];
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const secure = Bun.serve({ port: 0, tls: { key: Bun.file(key), cert: Bun.file(cert) }, fetch: () => new Response('ok') });
    try {
      const at = (s: number) => probeHttp(`http://localhost:${server.port}/${s}`, 2000);
      expect([await at(200), await at(499), await at(500)]).toEqual([
        { kind: 'ok', status: 200 },
        { kind: 'ok', status: 499 },
        { kind: 'bad', status: 500, message: 'HTTP 500' },
      ]);
      expect(await probeHttp(`https://localhost:${secure.port}/`, 2000)).toEqual({ kind: 'ok', status: 200 });
    } finally {
      server.stop(true);
      secure.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
    const refused = await fetch('http://127.0.0.1:1/').then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    expect(await probeHttp('http://127.0.0.1:1/', 2000)).toEqual({ kind: 'skip', message: refused.slice(0, 120) });
  });
});

describe('scan-korbor', () => {
  test('korborDir: KORBOR_DIR или соседний ../korbor', () => {
    expect(korborDir({}, path.resolve('/r/scripts'))).toBe(path.resolve('/korbor'));
    expect(korborDir({ KORBOR_DIR: '/k' }, '/r/scripts')).toBe(path.resolve('/k'));
  });
});
