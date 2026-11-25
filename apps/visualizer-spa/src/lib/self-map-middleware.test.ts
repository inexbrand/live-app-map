/**
 * GET /maps/live-app-map.liveappmap.json на настоящем HTTP-сервере: корень карты — текущий клон.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { SELF_MAP_FILE, selfMapMiddleware } from './self-map-middleware';

const FOREIGN = '/Users/someone/live-app-map';
let maps = '';
let monorepo = '';
let server: TestServer;

beforeEach(async () => {
  maps = mkdtempSync(path.join(tmpdir(), 'lam-self-maps-'));
  monorepo = mkdtempSync(path.join(tmpdir(), 'lam-self-root-'));
  const doc = { version: '1.0', pages: [], code: { root: FOREIGN, routes: [] }, docs: { root: FOREIGN, epochs: [], text: `Repo: ${FOREIGN}` } };
  writeFileSync(path.join(maps, SELF_MAP_FILE), JSON.stringify(doc));
  writeFileSync(path.join(maps, 'other.liveappmap.json'), JSON.stringify({ code: { root: FOREIGN } }));
  server = await serveMiddleware(selfMapMiddleware(maps, monorepo));
});
afterEach(() => server.close());

describe('self-map middleware', () => {
  test('карта live-app-map, снятая на другой машине, отдаётся с корнем текущего клона', async () => {
    const res = await fetch(`${server.url}/maps/${SELF_MAP_FILE}?t=1`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { code: { root: string }; docs: { root: string; text: string } };
    expect(doc.code.root).toBe(monorepo);
    expect(doc.docs.root).toBe(monorepo);
    // Текст документов не переписывается — только корни.
    expect(doc.docs.text).toBe(`Repo: ${FOREIGN}`);
  });

  test('другие карты не трогает', async () => {
    const res = await fetch(`${server.url}/maps/other.liveappmap.json`);
    expect(res.status).toBe(404);
  });
});
