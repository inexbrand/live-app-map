/**
 * /api/comments: HTTP-сервер + те же файлы, что читает MCP.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { callTool } from '@live-app-map/mcp-server';
import { createCommentsMiddleware } from './comments-middleware';
import { serveMiddleware, type TestServer } from './dev-http.test-helpers';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let lamDir = '';
let server: TestServer;
beforeEach(async () => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-cmw-'));
  server = await serveMiddleware(createCommentsMiddleware({ lamDir }));
});
afterEach(async () => {
  await server.close();
  rmSync(lamDir, { recursive: true, force: true });
});

const anchor = { mapName: 'korbor-miniapp', pageId: 'feed', pageTitle: 'Лента', pageUrl: null, role: null, element: null };

function post(p: string, body: unknown, origin?: string): Promise<Response> {
  return fetch(`${server.url}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin === undefined ? {} : { origin }) },
    body: JSON.stringify(body),
  });
}

/** Читает поток, пока не встретит строку (или 3 с). */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + 3000;
  while (!text.includes(needle) && Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    if (chunk === null || chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value);
  }
  return text;
}

describe('comments middleware', () => {
  test('создание со снимком → агент видит по MCP → ответ виден по GET; снимок отдаётся', async () => {
    const res = await post('/api/comments', { id: 'c1', text: 'Обрезан заголовок', anchor, shotDataUrl: PNG_1PX });
    expect(res.status).toBe(201);

    const listed = JSON.parse(callTool('list_comments', { status: 'open' }, { lamDir }).content[0]?.text ?? '{}') as { count: number };
    expect(listed.count).toBe(1);
    callTool('add_change_note', { commentId: 'c1', text: 'Поправил перенос', files: ['a.tsx'] }, { lamDir });

    const got = (await (await fetch(`${server.url}/api/comments?pageId=feed`)).json()) as { comments: Array<{ status: string; events: unknown[] }> };
    expect(got.comments[0]?.status).toBe('fixed');
    expect(got.comments[0]?.events).toHaveLength(3);
    expect((await fetch(`${server.url}/api/comments?status=open`).then((r) => r.json()) as { comments: unknown[] }).comments).toEqual([]);

    const shot = await fetch(`${server.url}/api/comments/c1/shot.png`);
    expect(shot.headers.get('content-type')).toBe('image/png');
    expect((await shot.arrayBuffer()).byteLength).toBeGreaterThan(50);

    const reopened = await post('/api/comments/c1/events', { type: 'status', status: 'open', note: 'не исправлено' });
    expect(((await reopened.json()) as { comment: { status: string } }).comment.status).toBe('open');
  });

  test('поток: запись агента по MCP приходит событием changed', async () => {
    const abort = new AbortController();
    const res = await fetch(`${server.url}/api/comments/stream`, { signal: abort.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body?.getReader();
    if (reader === undefined) {
      throw new Error('у потока нет тела');
    }
    const seen = readUntil(reader, 'event: changed');
    await post('/api/comments', { id: 'c9', text: 'Кнопка уехала', anchor, shotDataUrl: null });
    callTool('add_change_note', { commentId: 'c9', text: 'Вернул кнопку', files: ['b.tsx'] }, { lamDir });
    expect(await seen).toContain('event: changed');
    abort.abort();
  });

  test('пустой текст → 400 с подсказкой; чужой origin → 403; неизвестная ветка → 400', async () => {
    const empty = await post('/api/comments', { id: 'c2', text: ' ', anchor, shotDataUrl: null });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toContain('напишите, что не так');
    expect((await post('/api/comments', { id: 'c3', text: 'x', anchor, shotDataUrl: null }, 'https://evil.example')).status).toBe(403);
    expect((await post('/api/comments/nope/events', { type: 'reply', text: 'x' })).status).toBe(400);
  });
});

describe('замечание к таблице', () => {
  test('привязка к объявлению сохраняется и видна агенту по MCP', async () => {
    const code = { kind: 'table', name: 'users', file: 'packages/db/src/schema/users.ts', line: 10, endLine: 30 };
    const res = await post('/api/comments', { id: 't1', text: 'Добавь индекс на email', anchor: { ...anchor, pageId: 'db:users', pageTitle: 'users', code }, shotDataUrl: null });
    expect(res.status).toBe(201);
    const got = JSON.parse(callTool('get_comment', { id: 't1' }, { lamDir }).content[0]?.text ?? '{}') as { comment?: { anchor?: { code?: unknown } } };
    expect(got.comment?.anchor?.code).toEqual(code);
  });
});
