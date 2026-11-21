/**
 * Stdio MCP целиком: настоящий процесс server.ts, JSON-RPC построчно.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const serverPath = path.join(import.meta.dir, 'server.ts');
const miniappMap = path.resolve(import.meta.dir, '../../../maps/korbor-miniapp.liveappmap.json');
const allMap = path.resolve(import.meta.dir, '../../../maps/korbor-all.liveappmap.json');

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

  test('база знаний по коду на карте korbor: сервисы, роуты, роут → таблицы и экраны, схема таблицы', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-'));
    const call = (id: number, name: string, args: Record<string, unknown>) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: { mapPath: allMap, ...args } },
    });
    const out = await rpc(
      [
        call(1, 'list_services', {}),
        call(2, 'list_routes', { service: '@korbor/api', query: '/api/v1/recruiter/vacancies/:vacancyId/applications' }),
        call(3, 'get_route', { route: 'post /api/v1/recruiter/vacancies/:vacancyId/applications' }),
        call(4, 'get_table', { table: 'vacancies' }),
        call(5, 'get_route', { route: 'GET /api/v1/нет-такого' }),
        call(6, 'list_tables', { query: 'vacanc' }),
      ],
      lamDir,
    );
    const services = toolText(out[0]) as { services: Array<{ name: string; routes: number; tables: number }> };
    const api = services.services.find((s) => s.name === '@korbor/api');
    const db = services.services.find((s) => s.name === '@korbor/db');
    expect(api?.routes).toBeGreaterThan(200);
    expect(db?.tables).toBeGreaterThan(50);
    const routes = toolText(out[1]) as { routes: Array<{ method: string; summary?: string }> };
    expect(routes.routes.map((r) => r.method)).toEqual(['POST']);
    expect(routes.routes[0]?.summary ?? '').not.toMatch(/^`POST/);
    const route = toolText(out[2]) as { doc: string; writes: Array<{ dbName: string }>; screens: Array<{ nodeId: string }> };
    expect(route.doc.length).toBeGreaterThan(0);
    expect(route.writes.map((w) => w.dbName)).toContain('idempotency_keys');
    expect(route.screens.map((s) => s.nodeId)).toContain('miniapp:route:/vacancies/[id]');
    const table = toolText(out[3]) as {
      columns: Array<{ name: string; primaryKey?: boolean }>;
      references: Array<{ column: string; table: string }>;
      referencedBy: Array<{ table: string }>;
      readBy: string[];
    };
    expect(table.columns.find((c) => c.name === 'id')?.primaryKey).toBe(true);
    expect(table.references).toContainEqual(expect.objectContaining({ column: 'employerId', table: 'users' }));
    expect(table.referencedBy.map((r) => r.table)).toContain('applications');
    expect(table.readBy.length).toBeGreaterThan(0);
    expect(out[4]).toMatchObject({ id: 5, result: { isError: true } });
    const tables = toolText(out[5]) as { tables: Array<{ name: string }> };
    expect(tables.tables.map((t) => t.name)).toContain('vacancy_favorites');
  });
});
