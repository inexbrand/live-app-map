/**
 * Dev-сервер SPA: проверка TLS локальных сервисов, каталог карт, ответ path-proxy
 * для iframe — на настоящем HTTP-сервере и событиях прокси.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware } from './dev-http.test-helpers';
import { attachFrameBypass, stripProxyPrefix } from './frame-bypass';
import { mapsIndexMiddleware } from './maps-index-middleware';
import { tlsCheckMiddleware } from './tls-check-middleware';

describe('GET /__lam_tls_check', () => {
  const upstream = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 204 }) });
  afterAll(() => upstream.stop(true));

  async function check(query: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const server = await serveMiddleware(tlsCheckMiddleware);
    try {
      const r = await fetch(`${server.url}/__lam_tls_check${query}`);
      return { status: r.status, body: await r.json() };
    } finally {
      await server.close();
    }
  }

  test('отказы: нет url, не URL, не http(s), не локальный хост', async () => {
    expect(await check('')).toEqual({ status: 400, body: { ok: false, error: 'url required' } });
    expect(await check('?url=%3A%2F%2F')).toEqual({ status: 400, body: { ok: false, error: 'invalid url' } });
    expect(await check('?url=ftp%3A%2F%2Flocalhost%2F')).toEqual({ status: 400, body: { ok: false, error: 'only http(s)' } });
    expect(await check('?url=https%3A%2F%2Fexample.com%2F')).toEqual({ status: 403, body: { ok: false, error: 'host not allowlisted' } });
  });

  test('локальный сервис отвечает — ok и его статус; не отвечает — ok:false с подсказкой', async () => {
    const live = await check(`?url=${encodeURIComponent(`http://127.0.0.1:${upstream.port}/`)}`);
    expect(live).toEqual({
      status: 200,
      body: { ok: true, status: 204, protocol: 'http:', host: `127.0.0.1:${upstream.port}`, selfSignedOk: false, message: 'HTTP доступен' },
    });
    const down = await check(`?url=${encodeURIComponent('http://app.localhost:1/')}`);
    expect(down.status).toBe(200);
    expect(down.body).toMatchObject({ ok: false, host: 'app.localhost:1', hint: 'Проверьте, что miniapp/admin запущен. Для self-signed в iframe включите TLS-proxy.' });
  });

  test('чужой путь — следующему обработчику', async () => {
    const server = await serveMiddleware(tlsCheckMiddleware);
    try {
      const r = await fetch(`${server.url}/other`);
      expect([r.status, await r.text()]).toEqual([404, 'next']);
    } finally {
      await server.close();
    }
  });
});

describe('GET /maps/index.json', () => {
  test('каталог из файлов папки, с query тоже; чужой путь — дальше; ошибка — 500', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lam-maps-'));
    writeFileSync(
      path.join(dir, 'demo.liveappmap.json'),
      JSON.stringify({ version: '1.0', baseUrl: 'http://localhost:3000', app: { name: 'Демо' }, pages: [{ id: 'home', title: 'Главная', path: '/' }], edges: [] }),
    );
    const server = await serveMiddleware(mapsIndexMiddleware(dir));
    const broken = await serveMiddleware(mapsIndexMiddleware(path.join(dir, 'demo.liveappmap.json')));
    try {
      const r = await fetch(`${server.url}/maps/index.json?t=1`);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(JSON.stringify(await r.json())).toContain('demo.liveappmap.json');
      expect((await fetch(`${server.url}/maps/other.json`)).status).toBe(404);
      const bad = await fetch(`${broken.url}/maps/index.json`);
      expect(bad.status).toBe(500);
      expect(await bad.json()).toMatchObject({ ok: false });
    } finally {
      await server.close();
      await broken.close();
    }
  });
});

/** Ответ клиенту, который записывает заголовки и тело. */
type RecordingRes = {
  head?: [number, Record<string, unknown> | undefined];
  body?: string;
  writableEnded: boolean;
  writeHead: (c: number, h?: Record<string, unknown>) => void;
  end: (b?: string | Buffer) => void;
};

function recordingRes(): RecordingRes {
  const res: RecordingRes = {
    writableEnded: false,
    writeHead(c: number, h?: Record<string, unknown>) {
      res.head = [c, h];
    },
    end(b?: string | Buffer) {
      res.body = b === undefined ? '' : b.toString();
      res.writableEnded = true;
    },
  };
  return res;
}

describe('attachFrameBypass', () => {
  test('без сжатия к upstream; HTML переписан под префикс, iframe-блокеры сняты, длина задана', () => {
    const proxy = new EventEmitter();
    attachFrameBypass(proxy, 'site', '/__lam_proxy/site');
    const sent: [string, string][] = [];
    proxy.emit('proxyReq', { setHeader: (k: string, v: string) => sent.push([k, v]) });
    expect(sent).toEqual([['accept-encoding', 'identity']]);

    const upstream = Object.assign(new EventEmitter(), { headers: { 'content-type': ['text/html'], 'x-frame-options': 'DENY' }, statusCode: 201 });
    const res = recordingRes();
    proxy.emit('proxyRes', upstream, {}, res);
    upstream.emit('data', Buffer.from('<head></head><script src="/main'));
    upstream.emit('data', Buffer.from('.js"></script>'));
    upstream.emit('end');
    expect(res.head?.[0]).toBe(201);
    expect(res.head?.[1]?.['x-frame-options']).toBeUndefined();
    expect(res.head?.[1]?.['content-length']).toBe(Buffer.byteLength(res.body ?? ''));
    expect(res.body).toContain('src="/__lam_proxy/site/main.js"');
  });

  test('обрыв upstream — 502; ответ уже отдан — не трогается', () => {
    const proxy = new EventEmitter();
    attachFrameBypass(proxy, 'admin', '/__lam_proxy/admin');
    proxy.emit('error', new Error('нет связи'));
    const upstream = Object.assign(new EventEmitter(), { headers: {} });
    const res = recordingRes();
    proxy.emit('proxyRes', upstream, {}, res);
    upstream.emit('error', new Error('обрыв'));
    expect(res.head?.[0]).toBe(502);
    expect(res.body).toBe('lam-proxy admin: upstream error');
    upstream.emit('end');
    upstream.emit('error', 'ещё');
    expect(res.head?.[0]).toBe(502);
  });

  test('stripProxyPrefix: путь без префикса, пусто — корень', () => {
    expect(stripProxyPrefix('/__lam_proxy/site/a?b=1', '/__lam_proxy/site')).toBe('/a?b=1');
    expect(stripProxyPrefix('/__lam_proxy/site', '/__lam_proxy/site')).toBe('/');
    expect(stripProxyPrefix('/x', '/__lam_proxy/site')).toBe('/x');
  });
});
