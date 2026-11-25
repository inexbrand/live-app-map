/**
 * Исходник объявления через настоящий HTTP-сервер: файл внутри проекта,
 * выход за корень, нет файла, нет параметров.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from '../dev-http.test-helpers';
import { PROJECT_SOURCE_PATH, sourceSnippetSchema } from './source-contract';
import { sourceMiddleware } from './source-middleware';

const root = mkdtempSync(path.join(tmpdir(), 'lam-source-'));
mkdirSync(path.join(root, 'db'), { recursive: true });
writeFileSync(path.join(root, 'db/schema.ts'), "/** Т. */\nexport const t = pgTable('t', {\n  id: text('id'),\n});\n");
writeFileSync(path.join(tmpdir(), 'lam-outside.ts'), 'export const secret = 1;\n');

let srv: TestServer;
let none: TestServer;
beforeAll(async () => {
  srv = await serveMiddleware(sourceMiddleware(root));
  none = await serveMiddleware(sourceMiddleware(null));
});
afterAll(async () => {
  await srv.close();
  await none.close();
  rmSync(root, { recursive: true, force: true });
});

const get = (base: string, query: string) => fetch(`${base}${PROJECT_SOURCE_PATH}?${query}`);

describe('GET /__lam_project/source', () => {
  test('объявление по строке', async () => {
    const r = await get(srv.url, 'file=db/schema.ts&line=2');
    expect(r.status).toBe(200);
    expect(sourceSnippetSchema.parse(await r.json())).toEqual({
      file: 'db/schema.ts',
      startLine: 1,
      endLine: 4,
      text: "/** Т. */\nexport const t = pgTable('t', {\n  id: text('id'),\n});",
    });
  });

  test('файл вне проекта — 400', async () => {
    const r = await get(srv.url, `file=${encodeURIComponent('../lam-outside.ts')}&line=1`);
    expect(r.status).toBe(400);
  });

  test('нет файла — 404, нет строки — 400, строка мимо объявлений — 404', async () => {
    expect((await get(srv.url, 'file=db/nope.ts&line=1')).status).toBe(404);
    expect((await get(srv.url, 'file=db/schema.ts')).status).toBe(400);
    expect((await get(srv.url, 'file=db/schema.ts&line=40')).status).toBe(404);
  });

  test('проект не открыт — 404 с подсказкой', async () => {
    const r = await get(none.url, 'file=db/schema.ts&line=1');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toContain('--project');
  });
});
