/**
 * Плашка фокуса под выбранным экраном: появляется только при выборе, режим
 * выбора компонента или приложения, замечание к экрану, роли экрана со стейтами,
 * соседние экраны, «N открыто» открывает лист этого экрана.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import { foldThread } from '@live-app-map/mcp-server/comments-schema';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { openMap, resetStores } from '../test/fixtures';
import { FocusBar } from './FocusBar';

useDom();

beforeEach(() => {
  resetStores();
});

function pages() {
  return useAppStore.getState().document?.nodes.filter((n) => n.kind === 'page') ?? [];
}

function bar() {
  const r = render(<FocusBar />);
  return within(r.container);
}

describe('плашка фокуса', () => {
  test('нет выбора — нет плашки; экран без ролей — режимы, «К экрану», без переключателя ролей', () => {
    openMap('korbor-miniapp');
    const ui = bar();
    expect(ui.queryByTestId('focus-bar')).toBeNull();
    const plain = pages().find((p) => (p.states ?? []).length === 0);
    if (plain === undefined) {
      throw new Error('нужен экран без стейтов');
    }
    act(() => useAppStore.getState().selectPage(plain.id));
    expect(ui.getByTestId('focus-bar')).toBeTruthy();
    expect(ui.queryByLabelText('Роль')).toBeNull();
    fireEvent.click(ui.getByText('Приложение'));
    expect(useAppStore.getState().interactPageId).toBe(plain.id);
    fireEvent.click(ui.getByText('Выбор компонента'));
    expect(useAppStore.getState().interactPageId).toBeNull();
    fireEvent.click(ui.getByText('К экрану'));
    expect(useCommentsStore.getState().target?.anchor).toMatchObject({ pageId: plain.id, element: null });
  });

  test('экран с ролями — переключатель ролей включает и выключает стейт', () => {
    openMap('korbor-miniapp');
    const withRoles = pages().find((p) => (p.states ?? []).length > 0);
    const first = withRoles?.states?.[0];
    if (withRoles === undefined || first === undefined) {
      throw new Error('нужен экран со стейтами');
    }
    const ui = bar();
    act(() => useAppStore.getState().selectPage(withRoles.id));
    const btn = ui.getByLabelText('Роль').querySelector('button');
    if (btn === null) {
      throw new Error('нет кнопки роли');
    }
    fireEvent.click(btn);
    expect(useAppStore.getState().activeStates.get(withRoles.id)).toBe(first.name);
    fireEvent.click(btn);
    expect(useAppStore.getState().activeStates.get(withRoles.id)).toBeUndefined();
  });

  test('сосед — выбирает следующий экран; «N открыто» — лист этого экрана', () => {
    openMap('korbor-miniapp');
    const [a] = pages();
    if (a === undefined) {
      throw new Error('нет экранов');
    }
    const t = foldThread('c1', [{ type: 'created', seq: 0, at: '2025-03-01T10:00:00.000Z', author: 'user', text: 'Кнопка', anchor: { mapName: null, pageId: a.id, pageTitle: a.title, pageUrl: null, role: null, element: null }, shot: null }]);
    if (t === null) {
      throw new Error('нет ветки');
    }
    useCommentsStore.setState({ threads: [t] });
    const ui = bar();
    act(() => useAppStore.getState().selectPage(a.id));
    fireEvent.click(ui.getByTestId('focus-open'));
    expect(useCommentsStore.getState()).toMatchObject({ sheetOpen: true, sheetPage: a.id });
    fireEvent.click(ui.getByTitle('Следующий экран (])'));
    expect(useAppStore.getState().selectedPageId).not.toBe(a.id);
    expect(useAppStore.getState().selectedPageId).not.toBeNull();
  });
});
