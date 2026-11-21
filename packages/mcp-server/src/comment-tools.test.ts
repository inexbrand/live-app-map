/**
 * MCP: агент читает замечание, отвечает, что изменил, и закрывает его.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createComment } from './comments-store';
import { callTool } from './tools';

let lamDir = '';
beforeEach(() => {
  lamDir = mkdtempSync(path.join(tmpdir(), 'lam-ctools-'));
});
afterEach(() => {
  rmSync(lamDir, { recursive: true, force: true });
});

function call(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const res = callTool(name, args, { lamDir });
  const text = res.content[0]?.text ?? '';
  if (res.isError === true) {
    return { error: text };
  }
  return JSON.parse(text) as Record<string, unknown>;
}

describe('MCP замечаний', () => {
  test('list_comments → add_change_note → статус fixed, ответ в ветке; reopen', () => {
    createComment(lamDir, {
      id: 'c1',
      author: 'user',
      text: 'Кнопка налезает на текст',
      shotDataUrl: null,
      anchor: { mapName: 'korbor-miniapp', pageId: 'feed', pageTitle: 'Лента', pageUrl: null, role: null, element: null },
    });
    const open = call('list_comments', { status: 'open' });
    expect(open['count']).toBe(1);

    const note = call('add_change_note', { commentId: 'c1', text: 'Добавил gap 8', files: ['src/a.tsx'], commit: 'deadbee' });
    expect((note['comment'] as { status: string }).status).toBe('fixed');
    expect(call('list_comments', { status: 'open' })['count']).toBe(0);

    const full = call('get_comment', { id: 'c1' })['comment'] as { events: Array<{ type: string; files?: string[]; commit?: string }> };
    expect(full.events.map((e) => e.type)).toEqual(['created', 'reply', 'status']);
    expect(full.events[1]).toMatchObject({ files: ['src/a.tsx'], commit: 'deadbee' });

    expect((call('reopen_comment', { id: 'c1', note: 'не то' })['comment'] as { status: string }).status).toBe('open');
    expect((call('resolve_comment', { id: 'c1' })['comment'] as { status: string }).status).toBe('fixed');
  });

  test('add_change_note без commentId — новая заметка агента к экрану, сразу «исправлено»', () => {
    const res = call('add_change_note', { text: 'Перекрасил шапку', pageId: 'profile', pageTitle: 'Профиль', selector: 'header' });
    const c = res['comment'] as { status: string; author: string; element: { selector: string } };
    expect(c).toMatchObject({ status: 'fixed', author: 'agent', element: { selector: 'header' } });
    expect(call('list_comments', { author: 'agent' })['count']).toBe(1);
  });

  test('ошибки — понятным текстом', () => {
    expect(call('add_change_note', { text: '' })['error']).toContain('напишите, что изменено');
    expect(call('add_change_note', { text: 'x' })['error']).toContain('commentId');
    expect(call('resolve_comment', { id: 'nope' })['error']).toContain('не найдено');
    expect(call('list_comments', { status: 'done' })['error']).toContain('open или fixed');
  });
});
