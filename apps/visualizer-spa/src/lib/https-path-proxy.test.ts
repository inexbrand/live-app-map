/**
 * /__lam_proxy/https/<host:port> против настоящего HTTPS-сервера
 * с self-signed сертификатом (openssl).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { httpsPathProxyMiddleware, parseHttpsProxyTarget } from './https-path-proxy';

let upstream: Server;
let upstreamPort = 0;
let proxy: TestServer;

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lam-tls-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const gen = Bun.spawnSync([
    'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', key, '-out', cert,
  ]);
  if (gen.exitCode !== 0) {
    throw new Error(`openssl: ${gen.stderr.toString()}`);
  }
  upstream = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    if (req.url === '/echo' && req.method === 'POST') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ got: body, host: req.headers.host }));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'x-frame-options': 'DENY' });
    res.end(`<html><head></head><body><script src="/assets/app.js"></script>${req.url}</body></html>`);
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = upstream.address();
  if (address === null || typeof address === 'string') {
    throw new Error('upstream без TCP-порта');
  }
  upstreamPort = address.port;
  proxy = await serveMiddleware(httpsPathProxyMiddleware);
});

afterAll(async () => {
  await proxy.close();
  upstream.close();
});

describe('parseHttpsProxyTarget', () => {
  test('host:port, путь и query', () => {
    expect(parseHttpsProxyTarget('/__lam_proxy/https/app.localhost:8443/a/b?x=1')).toEqual({
      hostname: 'app.localhost',
      port: 8443,
      prefix: '/__lam_proxy/https/app.localhost:8443',
      path: '/a/b?x=1',
    });
    expect(parseHttpsProxyTarget('/__lam_proxy/https/localhost')?.path).toBe('/');
    expect(parseHttpsProxyTarget('/__lam_proxy/https/localhost?x=1')?.path).toBe('/?x=1');
    expect(parseHttpsProxyTarget('/__lam_proxy/https/localhost')?.port).toBe(443);
  });

  test('чужой хост и не наш путь → null', () => {
    expect(parseHttpsProxyTarget('/__lam_proxy/https/example.com/x')).toBeNull();
    expect(parseHttpsProxyTarget('/__lam_proxy/miniapp/x')).toBeNull();
  });
});

describe('httpsPathProxyMiddleware', () => {
  test('self-signed upstream: тело переписано, X-Frame-Options снят', async () => {
    const res = await fetch(`${proxy.url}/__lam_proxy/https/127.0.0.1:${upstreamPort}/page?q=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBeNull();
    const html = await res.text();
    expect(html).toContain(`src="/__lam_proxy/https/127.0.0.1:${upstreamPort}/assets/app.js"`);
    expect(html).toContain('/page?q=1');
  });

  test('POST с телом доходит до upstream', async () => {
    const res = await fetch(`${proxy.url}/__lam_proxy/https/127.0.0.1:${upstreamPort}/echo`, { method: 'POST', body: 'hello' });
    expect(await res.json()).toEqual({ got: 'hello', host: `127.0.0.1:${upstreamPort}` });
  });

  test('хост вне allowlist → 403; upstream лежит → 502', async () => {
    expect((await fetch(`${proxy.url}/__lam_proxy/https/example.com/`)).status).toBe(403);
    expect((await fetch(`${proxy.url}/__lam_proxy/https/127.0.0.1:1/`)).status).toBe(502);
  });
});
