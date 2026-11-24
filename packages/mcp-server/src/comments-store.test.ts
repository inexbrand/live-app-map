/**
 * Замечания к экранам на диске: события только дописываются, ветка — их свёртка.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addCommentEvent,
  createComment,
  listComments,
  readComment,
  type CommentAnchor,
} from './comments-store';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lam-comments-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const anchor: CommentAnchor = {
  mapName: 'korbor-miniapp',
  pageId: 'feed',
  pageTitle: 'Лента',
  pageUrl: 'https://vite.localhost:5175/#/feed',
  role: 'recruiter',
  element: {
    selector: 'main > button.apply',
    domPath: 'html > body > div#root > main > button.apply',
    tag: 'button',
    text: 'Откликнуться',
    rect: { x: 16, y: 420, width: 200, height: 44 },
    viewport: { width: 390, height: 844 },
    component: { name: 'ApplyButton', chain: ['ApplyButton', 'VacancyCard', 'FeedPage'], source: { file: 'apps/miniapp/src/feed/apply-button.tsx', line: 12, origin: 'code-map' } },
  },
};

const t0 = new Date('2026-11-21T10:00:00.000Z');
const t1 = new Date('2026-11-21T10:05:00.000Z');
const t2 = new Date('2026-11-21T10:06:00.000Z');

describe('comments-store', () => {
  test('замечание → ответ агента → исправлено → снова открыто', () => {
    const created = createComment(dir, { id: 'c1', author: 'user', text: 'Кнопка обрезана', anchor, shotDataUrl: PNG_1PX }, t0);
    expect(created.status).toBe('open');
    expect(created.shot).not.toBeNull();
    expect(existsSync(path.join(dir, 'comments', 'c1', created.shot ?? ''))).toBe(true);

    addCommentEvent(dir, 'c1', { type: 'reply', author: 'agent', text: 'Убрал фиксированную ширину', files: ['apps/miniapp/src/feed/apply-button.tsx'], commit: 'abc1234' }, t1);
    addCommentEvent(dir, 'c1', { type: 'status', author: 'agent', status: 'fixed', note: null }, t2);

    const thread = readComment(dir, 'c1');
    expect(thread?.status).toBe('fixed');
    expect(thread?.updatedAt).toBe(t2.toISOString());
    expect(thread?.events.map((e) => e.type)).toEqual(['created', 'reply', 'status']);
    const reply = thread?.events[1];
    expect(reply?.type === 'reply' ? reply.files : []).toEqual(['apps/miniapp/src/feed/apply-button.tsx']);

    addCommentEvent(dir, 'c1', { type: 'status', author: 'user', status: 'open', note: 'Всё ещё режется на 320' }, new Date('2026-11-21T11:00:00.000Z'));
    expect(readComment(dir, 'c1')?.status).toBe('open');
  });

  test('повторное создание с тем же id не плодит веток и не меняет текст', () => {
    createComment(dir, { id: 'c1', author: 'user', text: 'Первый', anchor, shotDataUrl: null }, t0);
    const again = createComment(dir, { id: 'c1', author: 'user', text: 'Второй', anchor, shotDataUrl: null }, t1);
    expect(again.text).toBe('Первый');
    expect(readdirSync(path.join(dir, 'comments', 'c1')).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  test('пустой текст и событие к несуществующей ветке — ошибка с понятным текстом', () => {
    expect(() => createComment(dir, { id: 'c1', author: 'user', text: '   ', anchor, shotDataUrl: null }, t0)).toThrow('текст замечания пустой');
    expect(() => addCommentEvent(dir, 'nope', { type: 'reply', author: 'agent', text: 'x', files: [], commit: null }, t0)).toThrow('замечание nope не найдено');
  });

  test('список: свежие сверху, фильтры по статусу, экрану, автору и тексту; битый файл пропущен', () => {
    createComment(dir, { id: 'a', author: 'user', text: 'Кнопка обрезана', anchor, shotDataUrl: null }, t0);
    createComment(dir, { id: 'b', author: 'agent', text: 'Поменял отступы шапки', anchor: { ...anchor, pageId: 'profile', element: null }, shotDataUrl: null }, t1);
    addCommentEvent(dir, 'b', { type: 'status', author: 'agent', status: 'fixed', note: null }, t2);
    writeFileSync(path.join(dir, 'comments', 'a', 'zz-broken.json'), '{нет');

    expect(listComments(dir, {}).map((c) => c.id)).toEqual(['b', 'a']);
    expect(listComments(dir, { status: 'open' }).map((c) => c.id)).toEqual(['a']);
    expect(listComments(dir, { pageId: 'profile' }).map((c) => c.id)).toEqual(['b']);
    expect(listComments(dir, { author: 'user' }).map((c) => c.id)).toEqual(['a']);
    expect(listComments(dir, { query: 'ОТСТУП' }).map((c) => c.id)).toEqual(['b']);
    expect(listComments(dir, { mapName: 'other' })).toEqual([]);
  });

  test('id с путём наружу отвергается', () => {
    expect(() => createComment(dir, { id: '../x', author: 'user', text: 'a', anchor, shotDataUrl: null }, t0)).toThrow('неверный id');
    expect(readComment(dir, '../../etc')).toBeNull();
  });
});

describe('этап ветки: ждёт агента → проверьте → исправлено', () => {
  const base = { id: 's1', author: 'user' as const, text: 'Кнопка уехала', anchor, shotDataUrl: null };

  test('новое замечание пользователя ждёт агента', () => {
    expect(createComment(dir, base).stage).toBe('waiting');
  });

  test('ответ агента и его «исправлено» — на проверку, не закрыто', () => {
    createComment(dir, base);
    addCommentEvent(dir, 's1', { type: 'reply', author: 'agent', text: 'Вернул', files: ['a.tsx'], commit: 'abc' });
    const t = addCommentEvent(dir, 's1', { type: 'status', author: 'agent', status: 'fixed', note: null });
    expect(t.stage).toBe('review');
  });

  test('пользователь принял — исправлено; вернул с причиной — снова ждёт агента', () => {
    createComment(dir, base);
    addCommentEvent(dir, 's1', { type: 'status', author: 'agent', status: 'fixed', note: null });
    expect(addCommentEvent(dir, 's1', { type: 'status', author: 'user', status: 'open', note: 'не исправлено' }).stage).toBe('waiting');
    addCommentEvent(dir, 's1', { type: 'reply', author: 'agent', text: 'Теперь точно', files: [], commit: null });
    expect(readComment(dir, 's1')?.stage).toBe('review');
    expect(addCommentEvent(dir, 's1', { type: 'status', author: 'user', status: 'fixed', note: null }).stage).toBe('done');
  });

  test('заметка самого агента — на проверку пользователю', () => {
    expect(createComment(dir, { ...base, id: 's2', author: 'agent' }).stage).toBe('review');
  });
});
