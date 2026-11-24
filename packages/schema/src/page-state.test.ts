/**
 * Состояние экрана в карте: поля контракта LamScreenState (id, label, kind, role, api, steps)
 * рядом со старыми name/inject.
 */
import { describe, expect, test } from 'bun:test';
import { parseAppMapDocument } from './parse';

function docWithStates(states: unknown[]): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.1' },
    revision: 'rev-test',
    project: { root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5173',
    nodes: [{ id: 'miniapp:route:/feed', kind: 'page', title: 'Лента', pathPattern: '/feed', states }],
    edges: [],
  };
}

describe('состояние экрана', () => {
  test('состояние по контракту без name: name берётся из id, поля сохраняются', () => {
    const r = parseAppMapDocument(
      docWithStates([
        {
          id: 'filters-open',
          label: 'Открыты фильтры',
          kind: 'ui',
          role: 'recruiter',
          api: { 'GET /api/v1/recruiter/feed': { status: 200, body: { items: [] } }, 'GET /api/v1/me': 'pending' },
          steps: [{ click: 'text=Фильтры' }, { fill: '#q', value: 'java' }, { press: 'Enter' }, { waitFor: '.modal' }, { scroll: 400 }],
          note: 'видна модалка',
        },
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const st = r.document.nodes[0]?.states?.[0];
    expect(st?.name).toBe('filters-open');
    expect(st?.id).toBe('filters-open');
    expect(st?.label).toBe('Открыты фильтры');
    expect(st?.kind).toBe('ui');
    expect(st?.role).toBe('recruiter');
    expect(st?.steps?.length).toBe(5);
    expect(st?.api?.['GET /api/v1/me']).toBe('pending');
  });

  test('старое состояние {name, inject} читается как раньше', () => {
    const r = parseAppMapDocument(docWithStates([{ name: 'recruiter', inject: { role: 'recruiter' } }]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.document.nodes[0]?.states?.[0]?.inject?.role).toBe('recruiter');
      expect(r.document.nodes[0]?.states?.[0]?.id).toBeUndefined();
    }
  });

  test('неизвестный вид состояния и шаг без действия — ошибка разбора', () => {
    expect(parseAppMapDocument(docWithStates([{ id: 'x', label: 'X', kind: 'weird' }])).ok).toBe(false);
    expect(parseAppMapDocument(docWithStates([{ id: 'x', label: 'X', kind: 'ui', steps: [{ hover: 'a' }] }])).ok).toBe(false);
    expect(parseAppMapDocument(docWithStates([{ id: 'Bad Id', label: 'X', kind: 'ui' }])).ok).toBe(false);
  });

  test('без name и без id — ошибка с подсказкой', () => {
    expect(parseAppMapDocument(docWithStates([{ label: 'X', kind: 'ui' }])).ok).toBe(false);
  });
});
