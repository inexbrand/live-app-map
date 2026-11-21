/**
 * GET /__lam_docs/asset на настоящем HTTP-сервере.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { docsAssetMiddleware } from './docs-asset-middleware';
import { docsAssetUrl } from './docs-asset-url';

let root = '';
let server: TestServer;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lam-asset-'));
  mkdirSync(path.join(root, 'docs/epoch/a#20261121-100000/screens'), { recursive: true });
  writeFileSync(path.join(root, 'docs/epoch/a#20261121-100000/screens/shot.png'), 'PNGDATA');
  writeFileSync(path.join(root, 'secret.png'), 'NO');
  writeFileSync(path.join(root, 'docs/notes.md'), '# md');
  server = await serveMiddleware(docsAssetMiddleware);
});
afterEach(() => server.close());

describe('docs-asset middleware', () => {
  test('картинка эпохи отдаётся с типом', async () => {
    const res = await fetch(`${server.url}${docsAssetUrl(root, 'docs/epoch/a#20261121-100000/screens/shot.png')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toBe('PNGDATA');
  });

  test('вне docs/, выход за корень и не-картинки — 400; нет файла — 404', async () => {
    const status = async (file: string): Promise<number> => (await fetch(`${server.url}${docsAssetUrl(root, file)}`)).status;
    expect(await status('secret.png')).toBe(400);
    expect(await status('docs/../../etc/passwd.png')).toBe(400);
    expect(await status('docs/notes.md')).toBe(400);
    expect(await status('docs/epoch/none.png')).toBe(404);
    expect((await fetch(`${server.url}/__lam_docs/asset?root=relative&path=docs/x.png`)).status).toBe(400);
  });
});
