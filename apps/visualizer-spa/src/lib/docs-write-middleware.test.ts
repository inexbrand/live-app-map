/**
 * Документация с диска и отметка пункта 09-bugs на настоящем HTTP-сервере
 * и настоящих файлах во временном каталоге.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { docsWriteMiddleware } from './docs-write-middleware';

const EPOCH = 'docs/epoch/demo#20261121-100000';
const BUGS = `${EPOCH}/09-bugs.md`;
let root = '';
let server: TestServer;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lam-docs-write-'));
  mkdirSync(path.join(root, EPOCH), { recursive: true });
  writeFileSync(path.join(root, BUGS), '# Баги\n\n## Open\n\n- Кнопка не нажимается\n\n## Closed\n\n- Старое\n');
  writeFileSync(path.join(root, EPOCH, '00-brief.md'), '# Бриф\n\n## Цель\n\nПроверка.\n');
  server = await serveMiddleware(docsWriteMiddleware);
});
afterEach(() => server.close());

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${server.url}/__lam_docs/bug`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('docs-write middleware', () => {
  test('живые docs без root — 400 с подсказкой', async () => {
    const res = await fetch(`${server.url}/__lam_docs/live`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('root');
  });

  test('закрыть пункт: файл на диске изменён, эпоха готова; повтор — без изменений', async () => {
    const res = await post({ root, path: BUGS, line: 4, text: 'Кнопка не нажимается', state: 'closed' });
    const body = (await res.json()) as { changed: boolean; epoch: { readiness: string; openBugs: string[] } };
    expect(res.status).toBe(200);
    expect(body.changed).toBe(true);
    expect(body.epoch.readiness).toBe('ready');
    expect(readFileSync(path.join(root, BUGS), 'utf8')).toContain('## Closed\n\n- Старое\n- Кнопка не нажимается');
    const line = readFileSync(path.join(root, BUGS), 'utf8').split('\n').indexOf('- Кнопка не нажимается');
    const again = (await (await post({ root, path: BUGS, line, text: 'Кнопка не нажимается', state: 'closed' })).json()) as { changed: boolean };
    expect(again.changed).toBe(false);
  });

  test('живые docs с диска видят правку', async () => {
    await post({ root, path: BUGS, line: 4, text: 'Кнопка не нажимается', state: 'closed' });
    const live = (await (await fetch(`${server.url}/__lam_docs/live?root=${encodeURIComponent(root)}`)).json()) as {
      docs: { epochs: { readiness: string; summary?: string }[] };
    };
    expect(live.docs.epochs.map((e) => [e.readiness, e.summary])).toEqual([['ready', 'Проверка.']]);
  });

  test('чужой файл, кривой пункт, чужой origin, нет каталога — отказ, файл цел', async () => {
    const before = readFileSync(path.join(root, BUGS), 'utf8');
    expect((await post({ root, path: `${EPOCH}/00-brief.md`, line: 0, text: 'x', state: 'closed' })).status).toBe(400);
    expect((await post({ root, path: 'docs/epoch/../../etc/09-bugs.md', line: 0, text: 'x', state: 'closed' })).status).toBe(400);
    expect((await post({ root, path: BUGS, line: 4, text: 'Другое', state: 'closed' })).status).toBe(409);
    expect((await post({ root, path: BUGS, line: 4, text: 'Кнопка не нажимается', state: 'closed' }, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await post({ root: path.join(root, 'нет'), path: BUGS, line: 4, text: 'Кнопка не нажимается', state: 'closed' })).status).toBe(404);
    expect((await fetch(`${server.url}/__lam_docs/live?root=relative`)).status).toBe(404);
    expect(readFileSync(path.join(root, BUGS), 'utf8')).toBe(before);
  });

  test('тело не по форме — 400 с подсказкой по полю', async () => {
    const ok = { root, path: BUGS, line: 4, text: 'Кнопка не нажимается', state: 'closed' };
    const bad = async (body: unknown): Promise<string> => {
      const r = await post(body);
      expect(r.status).toBe(400);
      const j: unknown = await r.json();
      return typeof j === 'object' && j !== null && 'error' in j ? String(j.error) : '';
    };
    expect(await bad('строка')).toContain('тело — JSON');
    expect(await bad({ ...ok, root: 'relative' })).toContain('root');
    expect(await bad({ ...ok, line: -1 })).toContain('line');
    expect(await bad({ ...ok, line: 1.5 })).toContain('line');
    expect(await bad({ ...ok, text: '' })).toContain('text');
    expect(await bad({ ...ok, state: 'done' })).toContain('state');
    const raw = await fetch(`${server.url}/__lam_docs/bug`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{не json' });
    expect(raw.status).toBe(400);
    expect((await fetch(`${server.url}/__lam_docs/bug`)).status).toBe(405);
  });
});
