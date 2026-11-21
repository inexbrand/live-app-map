/**
 * Версии карт на настоящем git-репозитории и настоящем HTTP-сервере; свежий скан —
 * настоящий процесс bun, который пишет карту во временный каталог.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { mapVersionsMiddleware } from './map-versions-middleware';
import type { ScanRecipes } from './map-versions';

let repo = '';
let server: TestServer;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

/** Скан «demo»: bun пишет карту с ревизией fresh в выходной файл. */
const recipes: ScanRecipes = (id, tmp) =>
  id === 'demo'
    ? {
        command: 'bun',
        args: ['-e', `await Bun.write(${JSON.stringify(path.join(tmp, 'out.json'))}, JSON.stringify({ revision: 'fresh' }))`],
        cwd: tmp,
        env: {},
        output: path.join(tmp, 'out.json'),
      }
    : null;

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), 'lam-versions-'));
  mkdirSync(path.join(repo, 'maps'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  const file = path.join(repo, 'maps/demo.liveappmap.json');
  writeFileSync(file, JSON.stringify({ revision: 'v1' }));
  git('add', '.');
  git('commit', '-q', '-m', 'первая версия');
  writeFileSync(file, JSON.stringify({ revision: 'v2' }));
  git('commit', '-q', '-am', 'вторая версия');
  writeFileSync(path.join(repo, 'maps/other.liveappmap.json'), '{}');
  server = await serveMiddleware(mapVersionsMiddleware(path.join(repo, 'maps'), recipes));
});
afterAll(() => server.close());

describe('версии карты', () => {
  test('без id — 400 с подсказкой, что вписать', async () => {
    const res = await fetch(`${server.url}/__lam_maps/versions`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('korbor-all');
  });

  test('коммиты файла новые первыми, версия по хешу — содержимое того коммита', async () => {
    const body = (await (await fetch(`${server.url}/__lam_maps/versions?id=demo`)).json()) as {
      versions: { ref: string; subject: string }[];
    };
    expect(body.versions.map((v) => v.subject)).toEqual(['вторая версия', 'первая версия']);
    const first = body.versions[1]?.ref ?? '';
    const res = await fetch(`${server.url}/__lam_maps/version?id=demo&ref=${first.slice(0, 10)}`);
    expect(await res.json()).toEqual({ revision: 'v1' });
  });

  test('неизвестная карта и путь вне каталога — 404; кривой ref — 400', async () => {
    expect((await fetch(`${server.url}/__lam_maps/versions?id=nope`)).status).toBe(404);
    expect((await fetch(`${server.url}/__lam_maps/versions?id=../maps/demo`)).status).toBe(404);
    expect((await fetch(`${server.url}/__lam_maps/version?id=demo&ref=HEAD;rm`)).status).toBe(400);
  });

  test('свежий скан: JSON из временного каталога; без рецепта — 502 с причиной; GET — 405', async () => {
    const res = await fetch(`${server.url}/__lam_maps/scan?id=demo`, { method: 'POST' });
    expect(await res.json()).toEqual({ revision: 'fresh' });
    const none = await fetch(`${server.url}/__lam_maps/scan?id=other`, { method: 'POST' });
    expect(none.status).toBe(502);
    expect(((await none.json()) as { error: string }).error).toContain('свежий скан не настроен');
    expect((await fetch(`${server.url}/__lam_maps/scan?id=demo`)).status).toBe(405);
  });
});
