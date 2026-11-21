/**
 * Шлюз на настоящих серверах: приложение-заглушка на Bun.serve и шлюз перед ним.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, statSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'bun';
import { startGateway } from './gateway-server';
import { SessionStore } from './session-store';

let app: Server<undefined>;
let gateway: ReturnType<typeof startGateway>;
let store: SessionStore;
let dir: string;
const seen: Array<{ cookie: string | null; origin: string | null; host: string | null }> = [];

beforeAll(() => {
  app = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url);
      seen.push({ cookie: req.headers.get('cookie'), origin: req.headers.get('origin'), host: req.headers.get('host') });
      if (url.pathname === '/login') {
        return new Response(null, {
          status: 302,
          headers: { location: `http://localhost:${app.port}/home`, 'set-cookie': 'sid=abc; Path=/; HttpOnly; Secure; SameSite=None' },
        });
      }
      if (url.pathname === '/api/me') {
        return Response.json({ ok: true });
      }
      return new Response('<html><head><title>x</title></head><body>ok</body></html>', {
        headers: { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" },
      });
    },
  });
  dir = mkdtempSync(path.join(tmpdir(), 'lam-sessions-'));
  store = new SessionStore(dir);
  store.upsert({ id: 'recruiter', label: 'Рекрутер', role: 'recruiter', origin: `http://localhost:${app.port}`, storage: { lam_init_data: 'user=1</script>' } });
  gateway = startGateway({ port: 0, store });
});

afterAll(() => {
  void gateway.stop(true);
  void app.stop(true);
});

/** Запрос к шлюзу с нужным Host. */
function get(profile: string, p: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = request(
      { hostname: '127.0.0.1', port: gateway.port, path: p, headers: { host: `${profile}--h${app.port}.localhost:${gateway.port}`, ...headers } },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString('utf8')));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    r.on('error', reject);
    r.end();
  });
}

describe('шлюз', () => {
  test('HTML: без X-Frame-Options и CSP, скрипт шлюза первым в <head> со storage профиля', async () => {
    const res = await get('recruiter', '/');
    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.body.indexOf('data-lam-gateway')).toBeGreaterThan(res.body.indexOf('<head>'));
    expect(res.body.indexOf('data-lam-gateway')).toBeLessThan(res.body.indexOf('<title>'));
    // «</script>» внутри значения не закрывает тег раньше времени.
    expect(res.body).toContain('user=1<\\/script>');
    expect(res.body).toContain('"recruiter"');
  });

  test('вход: кука ответа — в банку профиля (файл 600) и в браузер без Secure; Location — на шлюз', async () => {
    const res = await get('recruiter', '/login');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(`http://recruiter--h${app.port}.localhost:${gateway.port}/home`);
    expect(res.headers['set-cookie']).toEqual(['sid=abc; Path=/; HttpOnly; SameSite=Lax']);
    expect(store.get('recruiter')?.cookies[`http://localhost:${app.port}`]?.map((c) => c.name)).toEqual(['sid']);
    expect(statSync(path.join(dir, 'profiles.json')).mode & 0o777).toBe(0o600);
    // Перезагрузка хранилища с диска видит ту же куку.
    expect(new SessionStore(dir).get('recruiter')?.cookies[`http://localhost:${app.port}`]?.[0]?.value).toBe('abc');
  });

  test('следующий запрос несёт куку профиля, Host и Origin приложения; чужой профиль куку не видит', async () => {
    await get('recruiter', '/api/me', { origin: `http://recruiter--h${app.port}.localhost:${gateway.port}` });
    const last = seen[seen.length - 1];
    expect(last?.cookie).toBe('sid=abc');
    expect(last?.origin).toBe(`http://localhost:${app.port}`);
    expect(last?.host).toBe(`localhost:${app.port}`);
    await get('employer', '/api/me');
    expect(seen[seen.length - 1]?.cookie).toBeNull();
  });

  test('не адрес шлюза — 404 с подсказкой', async () => {
    const res = await new Promise<number>((resolve) => {
      request({ hostname: '127.0.0.1', port: gateway.port, path: '/', headers: { host: 'example.com' } }, (r) => resolve(r.statusCode ?? 0)).end();
    });
    expect(res).toBe(404);
  });
});
