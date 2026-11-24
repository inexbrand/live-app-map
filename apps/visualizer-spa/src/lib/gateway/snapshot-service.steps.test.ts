/**
 * Снимок узла-состояния на настоящем headless Helium: шаги выполняются до снимка,
 * снимки с разными шагами — разные файлы; шаги в адресе снимка проверяются на границе.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'bun';
import { decode } from 'jpeg-js';
import { parseSnapshotQuery } from './snapshot-middleware';
import { launchSnapshotBrowser } from './snapshot-browser';
import { SnapshotService } from './snapshot-service';
import { snapshotSrc } from './snapshot-url';
import { cellOf } from './gateway-host';

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
<button id="open" style="position:absolute;left:10px;top:10px;width:120px;height:40px">Фильтры</button>
<script>document.getElementById('open').addEventListener('click',function(){var m=document.createElement('div');m.setAttribute('role','dialog');m.style.cssText='position:fixed;inset:0;background:#0a0';document.body.appendChild(m);});</script>
</body></html>`;

let app: Server<undefined>;
let service: SnapshotService;

beforeAll(() => {
  app = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
  service = new SnapshotService({ dir: mkdtempSync(path.join(tmpdir(), 'lam-snap-steps-')), launch: launchSnapshotBrowser, idleCloseMs: 500 });
});

afterAll(async () => {
  await service.close();
  void app.stop(true);
});

function center(file: string): number[] {
  const img = decode(readFileSync(file), { useTArray: true });
  const at = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
  return [img.data[at] ?? 0, img.data[at + 1] ?? 0, img.data[at + 2] ?? 0];
}

describe('снимок узла-состояния', () => {
  test('шаг «клик» выполняется до снимка: на снимке модалка; без шагов — базовый экран', async () => {
    const url = `http://127.0.0.1:${app.port}/feed`;
    const withSteps = await service.get({ url, width: 400, height: 300, steps: [{ click: 'text=Фильтры' }] });
    const plain = await service.get({ url, width: 400, height: 300 });
    expect(withSteps).not.toBe(plain);
    expect(center(withSteps)[1] ?? 0).toBeGreaterThan(120);
    expect(center(withSteps)[0] ?? 255).toBeLessThan(60);
    expect(center(plain)).toEqual([255, 255, 255]);
  }, 40_000);

  test('шаги в адресе снимка: туда и обратно; неверные — понятная ошибка', () => {
    const page = `http://anon--s5175-vite--${cellOf('x')}.localhost:4320/feed`;
    const src = snapshotSrc(page, 400, 300, [{ click: 'text=Фильтры' }]);
    const q = new URL(src, 'http://x').searchParams;
    const ok = parseSnapshotQuery(q, 4320);
    expect(ok.ok && ok.steps).toEqual([{ click: 'text=Фильтры' }]);
    q.set('steps', '[{"hover":"a"}]');
    const bad = parseSnapshotQuery(q, 4320);
    expect(bad.ok ? '' : bad.error).toContain('steps');
    // без шагов адрес как раньше
    expect(snapshotSrc(page, 400, 300)).not.toContain('steps');
  });
});
