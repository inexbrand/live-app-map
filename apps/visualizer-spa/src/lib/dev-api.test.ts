/**
 * Клиент JSON-эндпоинтов dev-сервера на настоящем HTTP-сервере.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { anyBody, apiErrorText, apiField, requestJson, requestOk } from './dev-api';
import { readBody, sendJson, type DevMiddleware } from './dev-http';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';

/** Сервер-эхо: метод, content-type и тело запроса; /err — ошибка с текстом; /bad — не JSON. */
const echo: DevMiddleware = (req, res, next) => {
  const p = req.url ?? '';
  if (p === '/err') {
    sendJson(res, 409, { ok: false, error: 'конфликт', extra: 1 });
    return;
  }
  if (p === '/bare') {
    res.statusCode = 500;
    res.end('oops');
    return;
  }
  if (p === '/bad') {
    res.statusCode = 200;
    res.end('не json');
    return;
  }
  if (p !== '/echo') {
    next();
    return;
  }
  void readBody(req, 1024).then((b) =>
    sendJson(res, 200, { method: req.method, type: req.headers['content-type'] ?? null, body: b.ok ? b.text : null }),
  );
};

let server: TestServer;
beforeAll(async () => {
  server = await serveMiddleware(echo);
});
afterAll(() => server.close());

describe('requestJson', () => {
  test('GET без тела; POST шлёт JSON с content-type', async () => {
    expect(await requestJson(`${server.url}/echo`)).toEqual({
      ok: true,
      status: 200,
      value: { method: 'GET', type: null, body: '' },
    });
    const posted = await requestJson(`${server.url}/echo`, { method: 'POST', json: { a: 1 } });
    expect(posted.ok && posted.value).toEqual({ method: 'POST', type: 'application/json', body: '{"a":1}' });
  });

  test('ошибка: текст error из ответа, иначе HTTP-код; тело сохраняется', async () => {
    const err = await requestJson(`${server.url}/err`);
    expect(err).toEqual({ ok: false, status: 409, error: 'конфликт', body: { ok: false, error: 'конфликт', extra: 1 } });
    expect(anyBody(err)).toEqual({ ok: false, error: 'конфликт', extra: 1 });
    expect(await requestJson(`${server.url}/bare`)).toEqual({ ok: false, status: 500, error: 'HTTP 500', body: null });
  });

  test('не JSON в 2xx и сеть — status null и текст ошибки', async () => {
    const bad = await requestJson(`${server.url}/bad`);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.status).toBeNull();
    const down = await requestJson('http://127.0.0.1:1/x');
    expect(!down.ok && down.status === null && down.error !== '').toBe(true);
  });
});

describe('requestOk и разбор тела', () => {
  test('requestOk: 2xx — true, ошибка и сеть — false', async () => {
    expect(await requestOk(`${server.url}/echo`, { method: 'POST', json: {} })).toBe(true);
    expect(await requestOk(`${server.url}/err`)).toBe(false);
    expect(await requestOk('http://127.0.0.1:1/x')).toBe(false);
  });

  test('apiErrorText и apiField', () => {
    expect(apiErrorText({ error: 'x' })).toBe('x');
    expect(apiErrorText({ error: 1 })).toBeNull();
    const isNum = (v: unknown): v is number => typeof v === 'number';
    expect(apiField({ n: 2 }, 'n', isNum)).toBe(2);
    expect(apiField({ n: '2' }, 'n', isNum)).toBeNull();
    expect(apiField(null, 'n', isNum)).toBeNull();
  });
});

describe('параметры запроса', () => {
  /** fetch, который запоминает init и отвечает пустым JSON. */
  function recorder(status = 200, body: unknown = {}): { readonly fetchFn: typeof fetch; readonly inits: RequestInit[] } {
    const inits: RequestInit[] = [];
    const fetchFn: typeof fetch = async (_url, init) => {
      inits.push(init ?? {});
      return new Response(JSON.stringify(body), { status });
    };
    return { fetchFn, inits };
  }

  test('cache уходит в fetch, только если задан', async () => {
    const r = recorder();
    await requestJson('/x', { fetchFn: r.fetchFn, cache: 'no-store' });
    await requestJson('/x', { fetchFn: r.fetchFn });
    expect(r.inits[0]?.cache).toBe('no-store');
    expect(r.inits[1] !== undefined && 'cache' in r.inits[1]).toBe(false);
  });

  test('пустой error ответа — так и остаётся пустым, без подмены кодом', async () => {
    const r = recorder(500, { error: '' });
    const res = await requestJson('/x', { fetchFn: r.fetchFn });
    expect(res).toEqual({ ok: false, status: 500, error: '', body: { error: '' } });
  });

  test('apiField: поля нет или тело не объект — null', () => {
    const isNumber = (v: unknown): v is number => typeof v === 'number';
    expect(apiField({ a: 1 }, 'b', isNumber)).toBeNull();
    expect(apiField(null, 'a', isNumber)).toBeNull();
    expect(apiField({ a: 1 }, 'a', isNumber)).toBe(1);
  });
});
