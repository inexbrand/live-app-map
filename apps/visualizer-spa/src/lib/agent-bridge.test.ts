/**
 * Мост к агенту против настоящего agent-state middleware (HTTP + файлы).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readVisualizerState, writeSnapshotRequest } from '@live-app-map/mcp-server';
import {
  buildVisualizerState,
  pollAgentRequest,
  publishVisualizerState,
  uploadSnapshot,
  visualizerStateKey,
} from './agent-bridge';
import { createAgentStateMiddleware } from './agent-state-middleware';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let lamDir = '';
let server: TestServer;
let fetchToServer: typeof fetch;

beforeEach(async () => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-bridge-'));
  server = await serveMiddleware(createAgentStateMiddleware({ lamDir }));
  // браузер ходит относительными URL — направляем их на тестовый сервер
  const fn = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    fetch(`${server.url}${String(input)}`, init);
  fetchToServer = Object.assign(fn, { preconnect: fetch.preconnect });
});
afterEach(() => server.close());

const input = {
  mapName: 'site',
  baseUrl: '',
  mode: 'live',
  role: '',
  pageCount: 3,
  selected: { id: 'route:/', title: 'Главная', path: '/', url: 'http://localhost:16001/', stateName: null },
};

describe('agent bridge', () => {
  test('buildVisualizerState: пустые строки → null; ключ не зависит от времени', () => {
    const a = buildVisualizerState(input, new Date('2026-01-01T00:00:00Z'));
    const b = buildVisualizerState(input, new Date('2026-06-01T00:00:00Z'));
    expect(a.baseUrl).toBeNull();
    expect(a.role).toBeNull();
    expect(visualizerStateKey(a)).toBe(visualizerStateKey(b));
    expect(visualizerStateKey(a)).not.toBe(visualizerStateKey({ ...a, pageCount: 4 }));
  });

  test('publish → состояние на диске для MCP', async () => {
    const state = buildVisualizerState(input, new Date('2026-01-01T00:00:00Z'));
    expect(await publishVisualizerState(state, fetchToServer)).toBe(true);
    expect(readVisualizerState(lamDir)).toEqual(state);
  });

  test('poll видит просьбу агента, upload её закрывает', async () => {
    expect(await pollAgentRequest(fetchToServer)).toEqual({ ok: true, request: null });
    const req = writeSnapshotRequest(lamDir, 'меню');
    const polled = await pollAgentRequest(fetchToServer);
    expect(polled).toEqual({ ok: true, request: req });

    const up = await uploadSnapshot({ requestId: req.id, pageId: null, dataUrl: PNG_1PX }, fetchToServer);
    expect(up.ok).toBe(true);
    expect(up.ok && existsSync(up.file)).toBe(true);
    expect(await pollAgentRequest(fetchToServer)).toEqual({ ok: true, request: null });
  });

  test('нет dev-сервера (404) → unavailable; битый upload → текст ошибки сервера', async () => {
    const notFound = Object.assign(async () => new Response('', { status: 404 }), { preconnect: fetch.preconnect });
    expect(await pollAgentRequest(notFound)).toMatchObject({ ok: false, unavailable: true });
    const bad = await uploadSnapshot({ requestId: null, pageId: null, dataUrl: 'data:image/png;base64,' }, fetchToServer);
    expect(bad).toEqual({ ok: false, error: 'снимок пустой' });
  });
});
