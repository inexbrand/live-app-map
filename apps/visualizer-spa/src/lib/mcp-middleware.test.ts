/**
 * POST /mcp — JSON-RPC MCP по HTTP на настоящем сервере.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';
import { createMcpAgentMiddleware } from './mcp-middleware';
import { testMapPath } from '../test/fixtures';

const siteMap = testMapPath('korbor-site');

let server: TestServer;
beforeEach(async () => {
  server = await serveMiddleware(createMcpAgentMiddleware({ lamDir: mkdtempSync(path.join(tmpdir(), 'lam-mcp-http-')) }));
});
afterEach(() => server.close());

function rpc(body: unknown): Promise<Response> {
  return fetch(`${server.url}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('mcp middleware', () => {
  test('initialize и tools/call list_map_pages по HTTP', async () => {
    const init = (await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' })).json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(init.result.serverInfo.name).toBe('live-app-map-mcp');

    const call = (await (
      await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_map_pages', arguments: { mapPath: siteMap } } })
    ).json()) as { result: { content: Array<{ text: string }> } };
    const pages = JSON.parse(call.result.content[0]?.text ?? '{}') as { pages: unknown[] };
    const inFile = (JSON.parse(readFileSync(siteMap, 'utf8')) as { pages: unknown[] }).pages.length;
    expect(inFile).toBeGreaterThan(0);
    expect(pages.pages).toHaveLength(inFile);
  });

  test('уведомление → 202 без тела; мусор → parse error; GET → 405', async () => {
    const note = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(note.status).toBe(202);
    expect(await note.text()).toBe('');
    const bad = (await (await rpc('{nope')).json()) as { error: { code: number } };
    expect(bad.error.code).toBe(-32700);
    expect((await fetch(`${server.url}/mcp`)).status).toBe(405);
  });

  test('чужой origin отклоняется (DNS rebinding)', async () => {
    const res = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: { origin: 'http://attacker.test', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(403);
  });
});