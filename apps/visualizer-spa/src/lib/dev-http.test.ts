/**
 * Общие куски middleware dev-сервера на настоящем HTTP-сервере.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  endpointMiddleware,
  localEndpointMiddleware,
  readValidJson,
  rejectMethod,
  sendJson,
  underPath,
  type DevEndpoint,
} from './dev-http';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';

let server: TestServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const bodySchema = z.object({ name: z.string().min(1) });

const echo: DevEndpoint = {
  matches: underPath('/x'),
  errorStatus: 418,
  handle: async (req, res, p) => {
    if (p === '/x/boom') {
      throw new Error('сломалось');
    }
    if (req.method !== 'POST') {
      rejectMethod(res, 'POST', 'только POST');
      return;
    }
    const body = await readValidJson(req, res, bodySchema, 32);
    if (body !== null) {
      sendJson(res, 200, { ok: true, name: body.name });
    }
  },
};

async function call(url: string, init?: RequestInit): Promise<{ status: number; body: unknown; allow: string | null }> {
  const r = await fetch(url, init);
  const text = await r.text();
  return { status: r.status, body: text === '' ? null : JSON.parse(text), allow: r.headers.get('allow') };
}

describe('endpointMiddleware', () => {
  test('чужой путь уходит дальше; вложенный путь — свой', async () => {
    server = await serveMiddleware(endpointMiddleware(echo));
    const passed = await fetch(`${server.url}/xy`);
    expect([passed.status, await passed.text()]).toEqual([404, 'next']);
    expect(await call(`${server.url}/x/a`)).toEqual({ status: 405, body: { ok: false, error: 'только POST' }, allow: 'POST' });
  });

  test('исключение обработчика — JSON-ошибка с кодом эндпоинта', async () => {
    server = await serveMiddleware(endpointMiddleware(echo));
    expect((await call(`${server.url}/x/boom`)).body).toEqual({ ok: false, error: 'сломалось' });
    expect((await call(`${server.url}/x/boom`)).status).toBe(418);
  });

  test('тело: верное — разобрано; не по схеме — 400 «путь: сообщение»; большое — 413', async () => {
    server = await serveMiddleware(endpointMiddleware(echo));
    const post = (body: string) => call(`${server?.url ?? ''}/x`, { method: 'POST', body });
    expect((await post('{"name":"a"}')).body).toEqual({ ok: true, name: 'a' });
    const bad = await post('{"name":""}');
    expect(bad.status).toBe(400);
    expect(String((bad.body as { error: string }).error).startsWith('name: ')).toBe(true);
    expect((await post('не json')).status).toBe(400);
    expect((await post(`{"name":"${'a'.repeat(64)}"}`)).status).toBe(413);
  });
});

describe('localEndpointMiddleware', () => {
  test('чужой origin — 403 до обработчика; локальный и без origin — проходят', async () => {
    server = await serveMiddleware(localEndpointMiddleware(echo));
    expect(await call(`${server.url}/x`, { headers: { origin: 'http://evil.test' } })).toEqual({
      status: 403,
      body: { ok: false, error: 'origin не локальный' },
      allow: null,
    });
    expect((await call(`${server.url}/x`, { headers: { origin: 'http://app.localhost:4310' } })).status).toBe(405);
    expect((await call(`${server.url}/x`)).status).toBe(405);
  });
});
