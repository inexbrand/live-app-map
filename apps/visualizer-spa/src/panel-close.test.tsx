/**
 * Фокус выбранного экрана как у пользователя (с Б3 — плашка FocusBar под экраном,
 * правой панели и её крестика у экрана нет): Esc снимает фокус, плашки нет на других
 * видах; Esc не трогает фокус, пока открыто окно поверх.
 */
import { useDom } from './test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { useAppStore } from './store/app-store';
import { useViewStore, type AppView } from './store/view-store';
import { jsonResponse, mapJson, resetStores, stubFetch } from './test/fixtures';

useDom();

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  window.history.replaceState(null, '', '/?map=/maps/korbor-miniapp.liveappmap.json');
  net = stubFetch((url) => (url.endsWith('/maps/korbor-miniapp.liveappmap.json') ? jsonResponse(mapJson('korbor-miniapp')) : undefined));
});

afterEach(() => net.restore());

/** Открыть карту и выбрать первый экран. */
async function openWithSelection() {
  const r = render(<App />);
  await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
  const id = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page')?.id ?? '';
  act(() => useAppStore.getState().selectPage(id));
  return { r, box: within(r.container), id };
}

function esc(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('панель экрана', () => {
  test('у выбранного экрана — плашка фокуса, правой панели с крестиком нет', async () => {
    const { box } = await openWithSelection();
    await waitFor(() => expect(box.getByTestId('focus-bar')).toBeTruthy());
    expect(box.queryByRole('button', { name: 'Закрыть панель' })).toBeNull();
  });

  test('Esc снимает фокус: плашки нет', async () => {
    const { box } = await openWithSelection();
    await waitFor(() => expect(box.getByTestId('focus-bar')).toBeTruthy());
    esc();
    expect(useAppStore.getState().selectedPageId).toBeNull();
    await waitFor(() => expect(box.queryByTestId('focus-bar')).toBeNull());
  });

  test('на других видах плашки фокуса нет; вернулись к экранам — она снова там', async () => {
    const { box, id } = await openWithSelection();
    const views: readonly AppView[] = ['api', 'database', 'docs', 'compare'];
    for (const view of views) {
      act(() => useViewStore.getState().setView(view));
      expect(box.queryByTestId('focus-bar')).toBeNull();
    }
    act(() => useViewStore.getState().setView('screens'));
    expect(useAppStore.getState().selectedPageId).toBe(id);
    await waitFor(() => expect(box.getByTestId('focus-bar')).toBeTruthy());
  });

  test('Esc при открытом окне поверх (справка, лист) фокус не снимает', async () => {
    const { r, id } = await openWithSelection();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    r.container.append(dialog);
    esc();
    expect(useAppStore.getState().selectedPageId).toBe(id);
  });
});