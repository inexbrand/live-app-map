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

describe('mcp: архитектура API и документация', () => {
  const selfMap = path.resolve(import.meta.dir, '../../../maps/live-app-map.liveappmap.json');
  const call = (id: number, name: string, args: Record<string, unknown>): unknown => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });

  test('describe_api и get_route с входом и доступом на korbor', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-api-'));
    const out = await rpc(
      [
        call(1, 'describe_api', { mapPath: allMap, service: '@korbor/api', method: 'GET' }),
        call(2, 'get_route', { mapPath: allMap, route: 'GET /api/v1/admin/ledger' }),
        call(3, 'describe_api', { mapPath: allMap, method: 'FETCH' }),
      ],
      lamDir,
    );
    const api = toolText(out[0]) as {
      coverage: { routes: number; withAccess: number };
      services: Array<{ service: string; sections: Array<{ prefix: string; modules: Array<{ routes: string[] }> }> }>;
    };
    expect(api.services.map((s) => s.service)).toEqual(['@korbor/api']);
    const admin = api.services[0]?.sections.find((s) => s.prefix === '/api/v1/admin');
    expect(admin?.modules.flatMap((m) => m.routes).every((r) => r.startsWith('GET /api/v1/admin/'))).toBe(true);
    expect(api.coverage.withAccess).toBeGreaterThan(api.coverage.routes / 2);
    const ledger = toolText(out[1]) as { input: { query: { fields: Array<{ name: string }> } }; access: { permissions: string[] } };
    expect(ledger.input.query.fields.map((f) => f.name)).toContain('dealId');
    expect(ledger.access.permissions).toContain('admin.ledger.read');
    expect(out[2]).toMatchObject({ id: 3, result: { isError: true } });
  });

  test('описание из кода рядом с авторским, экраны роута и причина «без экранов»', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-auto-'));
    const out = await rpc(
      [
        call(1, 'get_route', { mapPath: allMap, route: 'GET /api/v1/admin/vacancies' }),
        call(2, 'describe_api', { mapPath: allMap, noScreens: true }),
        call(3, 'describe_api', { mapPath: allMap, undocumented: true }),
      ],
      lamDir,
    );
    const route = toolText(out[0]) as {
      doc?: string;
      autoDoc: { note: string; summary: string; lines: Array<{ label: string }> };
      screens: Array<{ nodeId: string }>;
      noScreens?: unknown;
    };
    expect(route.autoDoc.note).toBe('описание собрано из кода');
    expect(route.autoDoc.summary).toStartWith('Чтение «vacancies»');
    expect(route.autoDoc.lines.map((l) => l.label)).toContain('Читает');
    // Экран админки находится по switch на раздел пути.
    expect(route.screens.map((s) => s.nodeId)).toContain('admin:route:/vacancies');
    expect(route.noScreens).toBeUndefined();

    type Api = {
      coverage: { routes: number; withScreens: number; gaps: { unreached: number; otherClient: number; noCaller: number } };
      services: Array<{ sections: Array<{ modules: Array<{ routes: string[] }> }> }>;
    };
    const lines = (api: Api): string[] => api.services.flatMap((s) => s.sections.flatMap((x) => x.modules.flatMap((m) => m.routes)));
    const gaps = toolText(out[1]) as Api;
    expect(gaps.coverage.withScreens).toBe(0);
    expect(gaps.coverage.gaps.unreached + gaps.coverage.gaps.otherClient + gaps.coverage.gaps.noCaller).toBe(gaps.coverage.routes);
    expect(lines(gaps).every((l) => l.includes(' · без экранов: '))).toBe(true);
    const undocumented = lines(toolText(out[2]) as Api);
    expect(undocumented.length).toBeGreaterThan(0);
    expect(undocumented.every((l) => l.includes(' · из кода: '))).toBe(true);
  });

  test('list_epochs, get_epoch, search_docs по документации самого live-app-map', async () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-mcp-docs-'));
    const out = await rpc(
      [
        call(1, 'list_epochs', { mapPath: selfMap }),
        call(2, 'get_epoch', { mapPath: selfMap, epoch: 'live-korbor-e2e', file: '09-bugs.md' }),
        call(3, 'search_docs', { mapPath: selfMap, query: 'шлюз', limit: 3 }),
        call(4, 'get_epoch', { mapPath: selfMap, epoch: 'нет-такой' }),
      ],
      lamDir,
    );
    const list = toolText(out[0]) as { epochs: Array<{ id: string; date: string; readiness: string }> };
    expect(list.epochs.map((e) => e.id)).toContain('live-korbor-e2e#20261121-175119');
    const dates = list.epochs.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    const epoch = toolText(out[1]) as { id: string; files: Array<{ path: string; text: string }> };
    expect(epoch.id).toBe('live-korbor-e2e#20261121-175119');
    expect(epoch.files.map((f) => f.path)).toEqual(['docs/epoch/live-korbor-e2e#20261121-175119/09-bugs.md']);
    const hits = toolText(out[2]) as { hits: Array<{ path: string; line: number; snippet: string }> };
    expect(hits.hits).toHaveLength(3);
    expect(hits.hits.every((h) => h.snippet.toLowerCase().includes('шлюз') || h.path.includes('шлюз'))).toBe(true);
    expect(out[3]).toMatchObject({ id: 4, result: { isError: true } });
  });
});
