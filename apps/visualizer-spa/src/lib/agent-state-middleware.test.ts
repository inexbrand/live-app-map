/**
 * /api/agent-state и снимки: HTTP-сервер + те же файлы, что читает MCP.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { callTool, writeSnapshotRequest } from '@live-app-map/mcp-server';
import { createAgentStateMiddleware } from './agent-state-middleware';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let lamDir = '';
let server: TestServer;
beforeEach(async () => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-state-'));
  server = await serveMiddleware(createAgentStateMiddleware({ lamDir }));
});
afterEach(() => server.close());

const state = {
  mapName: 'site',
  baseUrl: 'http://localhost:16001',
  mode: 'live',
  role: null,
  pageCount: 35,
  selectedPage: { id: 'route:/', title: 'Главная', path: '/', url: 'http://localhost:16001/', stateName: null },
  updatedAt: '2026-11-20T10:00:00.000Z',
};

function postJson(p: string, body: unknown): Promise<Response> {
  return fetch(`${server.url}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toolJson(name: string, args: Record<string, unknown> = {}): unknown {
  return JSON.parse(callTool(name, args, { lamDir }).content[0]?.text ?? 'null');
}

describe('agent-state middleware', () => {
  test('опубликованное состояние видно через GET и MCP get_visualizer_state', async () => {
    const empty = (await (await fetch(`${server.url}/api/agent-state`)).json()) as { state: unknown };
    expect(empty.state).toBeNull();
    expect((await postJson('/api/agent-state', state)).status).toBe(200);
    const got = (await (await fetch(`${server.url}/api/agent-state`)).json()) as { state: unknown };
    expect(got.state).toEqual(state);
    expect(toolJson('get_visualizer_state')).toEqual({ ok: true, state });
  });

  test('неверное состояние → 400 с полем', async () => {
    const res = await postJson('/api/agent-state', { ...state, pageCount: -1 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('pageCount');
  });

  test('просьба агента → снимок из браузера → get_snapshot ready', async () => {
    const request = writeSnapshotRequest(lamDir, 'шапка');
    const pending = (await (await fetch(`${server.url}/api/agent-state`)).json()) as {
      pendingSnapshotRequest: { id: string } | null;
    };
    expect(pending.pendingSnapshotRequest?.id).toBe(request.id);

    const up = await postJson('/api/agent-state/snapshot', { requestId: request.id, pageId: 'route:/', dataUrl: PNG_1PX });
    expect(up.status).toBe(201);
    const { snapshot } = (await up.json()) as { snapshot: { file: string } };
    expect(existsSync(snapshot.file)).toBe(true);

    const after = (await (await fetch(`${server.url}/api/agent-state`)).json()) as { pendingSnapshotRequest: unknown };
    expect(after.pendingSnapshotRequest).toBeNull();
    expect(toolJson('get_snapshot', { requestId: request.id })).toMatchObject({ status: 'ready', snapshot: { file: snapshot.file } });
  });

  test('снимок не PNG → 400; DELETE → 405; чужой origin → 403', async () => {
    expect((await postJson('/api/agent-state/snapshot', { requestId: null, pageId: null, dataUrl: 'data:text/plain,hi' })).status).toBe(400);
    expect((await fetch(`${server.url}/api/agent-state`, { method: 'DELETE' })).status).toBe(405);
    const evil = await fetch(`${server.url}/api/agent-state`, { headers: { origin: 'http://evil.example' } });
    expect(evil.status).toBe(403);
  });
});
