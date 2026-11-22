/**
 * Команды CLI через runCli: вывод, файлы и коды выхода — как у пользователя bin.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseAppMapZip } from '@live-app-map/export-appmap';
import { codeSummary, feedbackMarkdown, flag, parseFeedback, runCli, type CliIo } from './commands';

const FIXTURES = path.resolve(import.meta.dir, '../../../fixtures');
const NEXT = path.join(FIXTURES, 'next-app-router-basic');
const SOURCE = path.join(FIXTURES, 'source-monorepo');
const tmp = mkdtempSync(path.join(tmpdir(), 'lam-cli-cmd-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Run = { readonly code: number; readonly out: string[]; readonly err: string[] };

async function run(...argv: string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { log: (t) => out.push(t), error: (t) => err.push(t), cwd: tmp, now: () => new Date('2026-11-22T10:00:00.000Z') };
  return { code: await runCli(argv, io), out, err };
}

function lastJson(r: Run): Record<string, unknown> {
  return JSON.parse(r.out.at(-1) ?? 'null') as Record<string, unknown>;
}

describe('runCli: справка', () => {
  test('без команды, --help и неизвестная команда — справка и код 1', async () => {
    for (const argv of [[], ['--help'], ['-h'], ['нет-такой']]) {
      const r = await run(...argv);
      expect(r.code).toBe(1);
      expect(r.out[0]).toContain('live-app-map scan --dir <path>');
    }
  });

  test('команды без обязательных аргументов — справка', async () => {
    for (const argv of [['diff', 'a.json'], ['export'], ['feedback']]) {
      const r = await run(...argv);
      expect([r.code, r.out[0]?.startsWith('live-app-map — scanner')]).toEqual([1, true]);
    }
  });
});

describe('runCli scan/code/doctor/diff/export', () => {
  const mapFile = path.join(tmp, 'next.json');

  test('scan печатает сводку и пишет файл; без страниц — ошибка с кодом 1', async () => {
    const r = await run('scan', '--dir', NEXT, '-o', mapFile, '--framework', 'next');
    expect(r.code).toBe(0);
    const s = lastJson(r);
    expect([s['ok'], s['framework'], s['out']]).toEqual([true, 'next', mapFile]);
    expect(Number(s['pages'])).toBeGreaterThanOrEqual(3);
    expect(existsSync(mapFile)).toBe(true);
    const empty = await run('scan', '--dir', path.join(tmp, 'нет'), '--framework', 'next');
    expect([empty.code, lastJson(empty)['ok'], lastJson(empty)['out']]).toEqual([1, false, null]);
    expect(empty.err.filter((l) => l.startsWith('[ошибка] NO_APP_DIR')).length).toBe(1);
    expect(empty.err).toContain('  подсказка: Проверьте --dir и framework');
  });

  test('scan --code-dir и code — сводка раздела code', async () => {
    const r = await run('scan', '--dir', NEXT, '--code-dir', SOURCE);
    expect(Number(lastJson(r)['services'])).toBeGreaterThan(0);
    const c = await run('code', '--dir', SOURCE, '--out', path.join(tmp, 'code.json'));
    expect(c.code).toBe(0);
    expect(Number(lastJson(c)['routes'])).toBeGreaterThan(0);
    expect(existsSync(path.join(tmp, 'code.json'))).toBe(true);
  });

  test('doctor — отчёт каталога', async () => {
    const r = await run('doctor', '--dir', NEXT);
    expect([r.code, lastJson(r)['framework']]).toEqual([0, 'next']);
  });

  test('diff: одинаковые карты — 0, разные — 1', async () => {
    const other = path.join(tmp, 'other.json');
    await run('scan', '--dir', path.join(FIXTURES, 'react-router-basic'), '-o', other);
    expect((await run('diff', mapFile, mapFile)).code).toBe(0);
    const d = await run('diff', mapFile, other);
    expect(d.code).toBe(1);
    expect(lastJson(d)).toHaveProperty('nodes');
  });

  test('export пишет .appmap, который читается обратно; неверная карта — ошибка', async () => {
    const out = path.join(tmp, 'map.appmap');
    const r = await run('export', mapFile, '-o', out);
    expect([r.code, lastJson(r)['out']]).toEqual([0, out]);
    const back = await parseAppMapZip(readFileSync(out));
    expect(back.ok).toBe(true);
    const bad = path.join(tmp, 'bad.json');
    writeFileSync(bad, JSON.stringify({ nodes: 1 }));
    const b = await run('export', bad);
    expect(b.code).toBe(1);
    expect(b.err.length).toBe(1);
  });
});

describe('runCli feedback и dev', () => {
  test('feedback пишет json и md в .lam-feedback рабочего каталога, --print-prompt печатает промпт', async () => {
    const file = path.join(tmp, 'fb.json');
    writeFileSync(file, JSON.stringify({ kind: 'live-app-map-feedback', version: 1, note: 'Кнопка не видна', page: { id: 'route:/a b', path: '/a' } }));
    const r = await run('feedback', '--file', file, '--print-prompt');
    expect(r.code).toBe(0);
    const s = lastJson(r);
    expect([s['pageId'], s['severity']]).toEqual(['route:/a b', 'medium']);
    expect(String(s['outMd'])).toBe(path.join(tmp, '.lam-feedback', '2026-11-22T10-00-00-000Z-route_a_b.md'));
    expect(readdirSync(path.join(tmp, '.lam-feedback')).sort()).toEqual(['2026-11-22T10-00-00-000Z-route_a_b.json', '2026-11-22T10-00-00-000Z-route_a_b.md']);
    expect(r.out[0]).toContain('## Note\nКнопка не видна');
    expect(readFileSync(String(s['outMd']), 'utf8')).toBe(`${r.out[0]}`);
  });

  test('feedback: неверный файл — текст ошибки и код 1', async () => {
    const file = path.join(tmp, 'fb-bad.json');
    writeFileSync(file, '[]');
    const r = await run('feedback', '-f', file);
    expect([r.code, r.err]).toEqual([1, ['feedback: kind должен быть live-app-map-feedback, version 1']]);
  });

  test('dev — подсказка запуска с картой и без', async () => {
    const r = await run('dev', '--target-url', 'http://x:1', '--port', '4999', '--map', 'm.json');
    expect(r.err[0]).toBe('Следующий шаг: bun run dev (порт 4999). Откройте http://localhost:4999/?baseUrl=http%3A%2F%2Fx%3A1 (карта: m.json)');
    expect(lastJson(r)['port']).toBe(4999);
    const plain = await run('dev');
    expect(plain.err[0]).toBe('Следующий шаг: bun run dev (порт 4310). Откройте http://localhost:4310/?baseUrl=http%3A%2F%2Flocalhost%3A3000');
    expect(lastJson(plain)['mapFile']).toBeNull();
  });
});

describe('разбор аргументов и замечаний', () => {
  test('flag: значение после имени; нет флага или он последний — null', () => {
    expect(flag(['--dir', 'x'], '--dir')).toBe('x');
    expect(flag(['--dir'], '--dir')).toBeNull();
    expect(flag([], '--dir')).toBeNull();
  });

  test('parseFeedback: JSON, объект, вид и версия, непустой note', () => {
    expect(parseFeedback('{')).toMatchObject({ ok: false, error: expect.stringMatching(/^feedback: невалидный JSON/) });
    expect(parseFeedback('null')).toEqual({ ok: false, error: 'feedback: ожидается объект Live App Map feedback v1' });
    expect(parseFeedback('"x"')).toEqual({ ok: false, error: 'feedback: ожидается объект Live App Map feedback v1' });
    expect(parseFeedback('{"kind":"live-app-map-feedback","version":2,"note":"a"}').ok).toBe(false);
    expect(parseFeedback('{"kind":"live-app-map-feedback","version":1,"note":"  "}')).toEqual({ ok: false, error: 'feedback: пустой note' });
    expect(parseFeedback('{"kind":"live-app-map-feedback","version":1,"note":"a"}').ok).toBe(true);
  });

  test('feedbackMarkdown: готовый промпт, иначе поля страницы', () => {
    expect(feedbackMarkdown({ note: 'n', promptMarkdown: '# свой' })).toBe('# свой');
    expect(feedbackMarkdown({ note: 'n', severity: 'high', page: { id: 'p', title: 'Т', path: '/p', url: 'http://h/p' } })).toBe(
      ['# Live App Map feedback', '', 'Severity: high', 'Page: Т (`p`)', 'Path: `/p`', 'URL: http://h/p', '', '## Note', 'n', ''].join('\n'),
    );
    expect(feedbackMarkdown({ note: 'n' })).toBe(['# Live App Map feedback', '', 'Severity: medium', 'Page: unknown (`unknown`)', '', '', '', '## Note', 'n', ''].join('\n'));
  });

  test('codeSummary: без apiCalls и screens — нули', () => {
    expect(codeSummary({ root: '.', services: [], symbols: [], routes: [], tables: [] })).toMatchObject({ apiCalls: 0, apiCallsMatched: 0, screensWithApi: 0 });
  });
});
