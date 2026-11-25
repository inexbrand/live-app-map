import { describe, expect, test } from 'bun:test';
import { commentThreadSchema } from '@live-app-map/mcp-server/comments-schema';
import { commentPrompt } from './comment-prompt';

const thread = commentThreadSchema.parse({
  id: 'c1',
  text: 'Добавь индекс на email',
  author: 'user',
  status: 'open',
  stage: 'waiting',
  createdAt: '2026-11-25T08:00:00.000Z',
  updatedAt: '2026-11-25T08:00:00.000Z',
  anchor: {
    mapName: 'korbor',
    pageId: 'db:users',
    pageTitle: 'users',
    pageUrl: null,
    role: null,
    element: null,
    code: { kind: 'table', name: 'users', file: 'packages/db/src/schema/users.ts', line: 10, endLine: 30 },
  },
  events: [],
  shot: null,
});

describe('commentPrompt', () => {
  test('замечание к таблице: заголовок таблицы и место объявления вместо экрана', () => {
    const text = commentPrompt(thread);
    expect(text).toContain('## Замечание к таблице «users»');
    expect(text).toContain('- Объявление: users — packages/db/src/schema/users.ts:10–30');
    expect(text).not.toContain('- Экран:');
    expect(text).toContain('commentId «c1»');
  });
});
