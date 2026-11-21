/**
 * Снимки на настоящем Chromium: страница-заглушка на Bun.serve.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import type { Server } from 'bun';
import { parseSnapshotQuery } from './snapshot-middleware';
import { SnapshotService } from './snapshot-service';

let app: Server<undefined>;
let hits = 0;
let service: SnapshotService;

beforeAll(() => {
  app = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch() {
      hits++;
      return new Response('<html><body style="margin:0;background:#c00"><h1>снимок</h1></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });
  service = new SnapshotService({ dir: mkdtempSync(path.join(tmpdir(), 'lam-snap-')), launch: () => chromium.launch(), freshMs: 60_000, idleCloseMs: 500 });
});

afterAll(async () => {
  await service.close();
  void app.stop(true);
});

describe('SnapshotService', () => {
  test('снимает JPEG, повтор отдаёт файл без новой загрузки, устаревший переснимает в фоне', async () => {
    const req = { url: `http://127.0.0.1:${app.port}/`, width: 390, height: 300 };
    const file = await service.get(req);
    const jpeg = readFileSync(file);
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    expect(hits).toBe(1);
    await service.get(req);
    expect(hits).toBe(1);
    const old = (Date.now() - 120_000) / 1000;
    utimesSync(file, old, old);
    expect(await service.get(req)).toBe(file);
    await Bun.sleep(3000);
    expect(hits).toBe(2);
    expect(statSync(file).mtimeMs).toBeGreaterThan(old * 1000);
  }, 30_000);

  test('одновременные запросы одного экрана — одна съёмка', async () => {
    const req = { url: `http://127.0.0.1:${app.port}/twice`, width: 400, height: 300 };
    const before = hits;
    const [a, b] = await Promise.all([service.get(req), service.get(req)]);
    expect(a).toBe(b);
    expect(hits - before).toBe(1);
  }, 30_000);
});

describe('parseSnapshotQuery', () => {
  test('только адреса шлюза и разумный размер', () => {
    const q = (o: Record<string, string>) => parseSnapshotQuery(new URLSearchParams(o), 4320);
    expect(q({ url: 'http://admin--h16002--abc.localhost:4320/users', w: '1280', h: '800' }).ok).toBe(true);
    expect(q({ url: 'http://example.com:4320/', w: '1280', h: '800' }).ok).toBe(false);
    expect(q({ url: 'http://admin--h16002.localhost:9999/', w: '1280', h: '800' }).ok).toBe(false);
    expect(q({ url: 'http://admin--h16002.localhost:4320/', w: '10', h: '800' }).ok).toBe(false);
    expect(q({ w: '1280', h: '800' }).ok).toBe(false);
  });
});
