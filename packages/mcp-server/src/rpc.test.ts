/**
 * JSON-RPC и tools в процессе: протокол, база знаний по коду, документация, карта, stdio.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { handleRpcText, type RpcResponse } from './rpc';
import { saveFeedback } from './feedback-store';
import { serveLines, splitLines } from './stdio';
import { mapWithUndocumentedRoutes } from './undocumented-map.test-helpers';

const MAPS = path.resolve(import.meta.dir, '../../../maps');
const TEST_MAPS = path.resolve(import.meta.dir, '../../../test-fixtures/maps');
const ALL = path.join(TEST_MAPS, 'korbor-all.liveappmap.json');
const SELF = path.join(MAPS, 'live-app-map.liveappmap.json');
const ctx = { lamDir: mkdtempSync(path.join(tmpdir(), 'lam-rpc-')) };

/** Карта админки во внутреннем (enterprise) формате — из среза liveappmap. */
const ADMIN = ((): string => {
  const live = parseLiveAppMapJson(readFileSync(path.join(TEST_MAPS, 'korbor-admin.liveappmap.json'), 'utf8'));
  if (!live.ok) {
    throw new Error('срез korbor-admin не разобрался');
  }
  const file = path.join(ctx.lamDir, 'korbor-admin.json');
  writeFileSync(file, JSON.stringify(liveAppMapToAppMap(live.document)));
  return file;
})();

type Content = { content: { text: string }[]; isError?: boolean };

function call(name: string, args: Record<string, unknown>): Content {
  const r = handleRpcText(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), ctx);
  if (r === null || !('result' in r)) {
    throw new Error(`нет результата: ${JSON.stringify(r)}`);
  }
  return r.result as Content;
}

function data(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const r = call(name, args);
  expect(r.isError).toBeUndefined();
  return JSON.parse(r.content[0]?.text ?? 'null') as Record<string, unknown>;
}

function errorText(name: string, args: Record<string, unknown>): string {
  const r = call(name, args);
  expect(r.isError).toBe(true);
  return r.content[0]?.text ?? '';
}

const rawMap = JSON.parse(readFileSync(ALL, 'utf8')) as {
  code: { services: { id: string; name: string }[]; routes: { id: string; method: string; path: string; serviceId: string }[]; tables: { name: string }[] };
};

/** Значение фикстуры обязано быть — иначе тест бессмыслен. */
function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`в фикстуре нет: ${what}`);
  return value;
}

describe('протокол', () => {
  test('ошибки разбора и запроса, уведомление без ответа, id не строка и не число — null', () => {
    const r = (line: string): RpcResponse | null => handleRpcText(line, ctx);
    expect(r('{')).toMatchObject({ id: null, error: { code: -32700 } });
    for (const bad of ['null', '[]', '{"method":1}']) {
      expect(r(bad)).toMatchObject({ id: null, error: { code: -32600 } });
    }
    expect(r('{"jsonrpc":"2.0","method":"ping"}')).toBeNull();
    expect(r('{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}')).toEqual({ jsonrpc: '2.0', id: null, result: {} });
    expect(r('{"jsonrpc":"2.0","id":"s","method":"нет"}')).toEqual({ jsonrpc: '2.0', id: 's', error: { code: -32601, message: 'method not found: нет' } });
    expect(r('{"jsonrpc":"2.0","id":2,"method":"tools/list"}')).toMatchObject({ id: 2, result: { tools: expect.arrayContaining([expect.objectContaining({ name: 'get_route' })]) } });
    expect(r('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":5}}')).toMatchObject({ id: 3, result: { isError: true } });
  });
});

describe('база знаний по коду', () => {
  const route = present(rawMap.code.routes[0], 'роут в карте');
  const service = present(rawMap.code.services.find((s) => s.id === route.serviceId), 'сервис роута');

  test('list_routes по сервису: только его роуты; неизвестный сервис — ошибка со списком', () => {
    const r = data('list_routes', { mapPath: ALL, service: service?.name });
    const routes = r['routes'] as { service: string; reads: unknown[] }[];
    expect(routes.length).toBe(rawMap.code.routes.filter((x) => x.serviceId === route?.serviceId).length);
    expect(new Set(routes.map((x) => x.service))).toEqual(new Set([service?.name]));
    expect(errorText('list_routes', { mapPath: ALL, service: 'нет-такого' })).toContain(`сервис не найден: нет-такого. Есть: ${rawMap.code.services.map((s) => s.name).join(', ')}`);
  });

  test('get_route по «МЕТОД путь»; не найден — похожие по последнему сегменту', () => {
    const r = data('get_route', { mapPath: ALL, route: `${route?.method} ${route?.path}` });
    expect([r['id'], r['service']]).toEqual([route?.id, service?.name]);
    expect(r['autoDoc']).toHaveProperty('note');
    const tail = route?.path.split('/').filter((s) => s !== '' && !s.startsWith(':')).pop() ?? '';
    expect(errorText('get_route', { mapPath: ALL, route: `GET /нет/${tail}/:id` })).toContain(`${route?.method} ${route?.path}`);
    expect(errorText('get_route', { mapPath: ALL, route: 'GET /:id' })).toEndWith('Похожие: нет');
    expect(errorText('get_route', { mapPath: ALL })).toBe('route обязателен: id роута или «GET /api/v1/…»');
  });

  test('describe_api: фильтр метода без учёта регистра, неизвестный метод — ошибка', () => {
    const bare = mapWithUndocumentedRoutes(ALL, ctx.lamDir);
    expect(bare.undocumented).toBeGreaterThan(0);
    const post = data('describe_api', { mapPath: bare.file, method: 'post', noScreens: true, undocumented: true });
    const lines = (post['services'] as { sections: { modules: { routes: string[] }[] }[] }[]).flatMap((s) => s.sections.flatMap((x) => x.modules.flatMap((m) => m.routes)));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.startsWith('POST ') && l.includes(' · без экранов: '))).toBe(true);
    expect(errorText('describe_api', { mapPath: ALL, method: 'zz' })).toBe('method: одно из GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD, ALL');
  });

  test('list_tables с подстрокой, get_table по имени; нет таблицы — похожие', () => {
    const table = rawMap.code.tables[0]?.name ?? '';
    const listed = data('list_tables', { mapPath: ALL, query: table.toUpperCase() })['tables'] as { name: string }[];
    expect(listed.map((t) => t.name)).toContain(table);
    const t = data('get_table', { mapPath: ALL, table });
    expect([t['name'], Array.isArray(t['columns'])]).toEqual([table, true]);
    expect(errorText('get_table', { mapPath: ALL, table: table.slice(1).toUpperCase() })).toContain(table);
    expect(errorText('get_table', { mapPath: ALL, table: 'zzzz' })).toBe('таблица не найдена: zzzz. Похожие: нет');
  });
});

describe('документация', () => {
  const docs = (JSON.parse(readFileSync(SELF, 'utf8')) as { docs: { epochs: { id: string; readiness: string; files: { path: string }[] }[] } }).docs;
  const epoch = present(docs.epochs[0], 'эпоха в карте');

  test('list_epochs: фильтр готовности, неизвестная — ошибка', () => {
    const ready = data('list_epochs', { mapPath: SELF, readiness: 'ready' })['epochs'] as { readiness: string }[];
    expect(ready.length).toBe(docs.epochs.filter((e) => e.readiness === 'ready').length);
    expect(errorText('list_epochs', { mapPath: SELF, readiness: 'x' })).toBe('readiness: одно из ready, not-ready, no-bugs-file');
  });

  test('get_epoch: все файлы, один файл, нет файла, нет эпохи', () => {
    expect((data('get_epoch', { mapPath: SELF, epoch: epoch?.id })['files'] as unknown[]).length).toBe(epoch?.files.length);
    const first = path.basename(epoch?.files[0]?.path ?? '');
    expect((data('get_epoch', { mapPath: SELF, epoch: epoch?.id, file: first })['files'] as { path: string }[]).map((f) => path.basename(f.path))).toEqual([first]);
    expect(errorText('get_epoch', { mapPath: SELF, epoch: epoch?.id, file: 'нет.md' })).toStartWith(`в эпохе ${epoch?.id} нет файла нет.md. Есть: `);
    expect(errorText('get_epoch', { mapPath: SELF, epoch: 'нет-такой#1' })).toBe('эпоха не найдена: нет-такой#1. Похожие: нет');
  });
});

describe('карта и feedback', () => {
  test('list_map_pages: enterprise — только страницы, путь из примера или шаблона', () => {
    const doc = JSON.parse(readFileSync(ADMIN, 'utf8')) as { nodes: { id: string; kind: string; pathExample?: string; pathPattern: string }[] };
    const pages = data('list_map_pages', { mapPath: ADMIN })['pages'] as { id: string; path: string }[];
    const expected = doc.nodes.filter((n) => n.kind === 'page');
    expect(pages.map((p) => [p.id, p.path])).toEqual(expected.map((n) => [n.id, n.pathExample ?? n.pathPattern]));
  });

  test('не карта — ошибка', () => {
    expect(errorText('list_map_pages', { mapPath: path.join(MAPS, 'sample-feedback.json') })).toContain('не карта Live App Map');
  });

  test('saveFeedback: id страницы в имени, без промпта — без md', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lam-fb-'));
    const now = new Date('2026-11-22T00:00:00.000Z');
    expect(saveFeedback(dir, { page: { id: 'route:/a' } }, now).mdPath).toBeNull();
    expect(saveFeedback(dir, { page: null, promptMarkdown: '# x' }, now).mdPath).toBe(path.join(dir, '2026-11-22T00-00-00-000Z-feedback.md'));
    expect(readdirSync(dir).sort()).toEqual(['2026-11-22T00-00-00-000Z-feedback.json', '2026-11-22T00-00-00-000Z-feedback.md', '2026-11-22T00-00-00-000Z-route_a.json']);
  });
});

describe('stdio', () => {
  test('splitLines: полные строки без пустых, хвост — отдельно', () => {
    expect(splitLines(' a \n\nb\nc')).toEqual({ lines: ['a', 'b'], rest: 'c' });
    expect(splitLines('')).toEqual({ lines: [], rest: '' });
  });

  test('serveLines: строка, разорванная между кусками, — один ответ; уведомление — без ответа', async () => {
    const enc = new TextEncoder();
    const chunks = ['{"jsonrpc":"2.0","id":1,"met', 'hod":"ping"}\n{"jsonrpc":"2.0","method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n'];
    const input = new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((s) => c.enqueue(enc.encode(s)));
        c.close();
      },
    });
    const out: string[] = [];
    await serveLines(input, (l) => out.push(l), ctx);
    expect(out).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}\n', '{"jsonrpc":"2.0","id":2,"result":{}}\n']);
  });
});
