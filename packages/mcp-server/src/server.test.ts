/**
 * Stdio MCP целиком: настоящий процесс server.ts, JSON-RPC построчно.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const serverPath = path.join(import.meta.dir, 'server.ts');
const miniappMap = path.resolve(import.meta.dir, '../../../maps/korbor-miniapp.liveappmap.json');

async function rpc(lines: readonly unknown[], lamDir: string): Promise<unknown[]> {
  const proc = Bun.spawn(['bun', 'run', serverPath], {
    stdin: 'pipe',
    stdout: 'pipe',
    env: { ...process.env, LAM_FEEDBACK_DIR: lamDir },
  });
  for (const l of lines) {
    proc.stdin.write(`${typeof l === 'string' ? l : JSON.stringify(l)}\n`);
  }
  await proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.trim().split('\n').filter((s) => s !== '').map((s): unknown => JSON.parse(s));
}

function toolText(resp: unknown): unknown {
  const r = resp as { result: { content: Array<{ text: string }> } };
  return JSON.parse(r.result.content[0]?.text ?? 'null');
}

describe('mcp stdio server', () => {
  test('initialize, tools/list, list_map_pages, ошибки протокола', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-'));
    const out = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_map_pages', arguments: { mapPath: miniappMap } } },
        '{oops',
        { jsonrpc: '2.0', id: 4, method: 'nope' },
      ],
      lamDir,
    );
    // уведомление без ответа → 5 ответов на 6 строк
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ id: 1, result: { serverInfo: { name: 'live-app-map-mcp' } } });
    const names = (out[1] as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name);
    expect(names).toContain('get_visualizer_state');
    expect(names).toContain('request_snapshot');
    const pages = toolText(out[2]) as { pages: Array<{ id: string }> };
    expect(pages.pages.length).toBeGreaterThan(0);
    expect(out[3]).toMatchObject({ id: null, error: { code: -32700 } });
    expect(out[4]).toMatchObject({ id: 4, error: { code: -32601 } });
  });

  test('request_snapshot → get_snapshot pending; feedback сохраняется в LAM_FEEDBACK_DIR', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-'));
    const out = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'request_snapshot', arguments: { note: 'шапка' } } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_snapshot', arguments: {} } },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'submit_feedback', arguments: { feedback: { page: { id: 'route/feed' }, promptMarkdown: '# fix' } } } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_visualizer_state', arguments: {} } },
      ],
      lamDir,
    );
    const req = toolText(out[0]) as { request: { id: string; note: string } };
    expect(req.request.note).toBe('шапка');
    const snap = toolText(out[1]) as { status: string; pendingRequest: { id: string } };
    expect(snap.status).toBe('none');
    expect(snap.pendingRequest.id).toBe(req.request.id);
    const fb = toolText(out[2]) as { jsonPath: string; mdPath: string };
    expect(fb.jsonPath.startsWith(lamDir)).toBe(true);
    expect(fb.jsonPath).toContain('route_feed');
    expect(await Bun.file(fb.mdPath).text()).toBe('# fix\n');
    expect(out[3]).toMatchObject({ id: 4, result: { isError: true } });
  });
});
