import { describe, expect, test } from 'bun:test';
import { fetchProjectStates, parseProjectStates } from './project-states';

const FEED = 'miniapp:route:/feed';

describe('состояния проекта', () => {
  test('200 со screens — карта экран → состояния, name из id', () => {
    const r = parseProjectStates(200, { screens: { [FEED]: [{ id: 'empty', label: 'Пусто', kind: 'empty', api: { 'GET /api/v1/feed': { status: 200, body: [] } } }] } });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.states.get(FEED)?.[0]?.name).toBe('empty');
      expect(r.states.get(FEED)?.[0]?.kind).toBe('empty');
    }
  });

  test('404 — проекта нет; 500 — ошибка с текстом сервера; неверная форма — путь поля в ошибке', () => {
    expect(parseProjectStates(404, { error: 'нет' }).kind).toBe('none');
    const e500 = parseProjectStates(500, { error: 'SyntaxError в states.ts' });
    expect(e500.kind === 'error' ? e500.message : '').toContain('SyntaxError в states.ts');
    const bad = parseProjectStates(200, { screens: { [FEED]: [{ id: 'x', label: 'X', kind: 'странный' }] } });
    expect(bad.kind === 'error' ? bad.message : '').toContain(FEED);
  });

  test('dev-сервер без эндпоинта отдаёт index.html — «проекта нет»', async () => {
    const html = async (): Promise<Response> => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    expect((await fetchProjectStates(html)).kind).toBe('none');
    const json = async (): Promise<Response> => Response.json({ screens: { [FEED]: [] } });
    expect((await fetchProjectStates(json)).kind).toBe('ok');
  });
});
