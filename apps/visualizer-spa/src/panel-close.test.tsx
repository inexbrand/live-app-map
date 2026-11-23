/**
 * Панель выбранного экрана как у пользователя: закрывается крестиком и Esc,
 * не висит поверх других видов; Esc не трогает её, пока открыто окно поверх.
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
  test('крестик закрывает панель и снимает выбор', async () => {
    const { box } = await openWithSelection();
    fireEvent.click(box.getByRole('button', { name: 'Закрыть панель' }));
    expect(useAppStore.getState().selectedPageId).toBeNull();
    expect(box.queryByRole('button', { name: 'Закрыть панель' })).toBeNull();
  });

  test('Esc закрывает панель', async () => {
    const { box } = await openWithSelection();
    esc();
    expect(useAppStore.getState().selectedPageId).toBeNull();
    expect(box.queryByRole('button', { name: 'Закрыть панель' })).toBeNull();
  });

  test('на других видах панели нет; вернулись к экранам — она снова там', async () => {
    const { box, id } = await openWithSelection();
    const views: readonly AppView[] = ['api', 'database', 'docs', 'compare'];
    for (const view of views) {
      act(() => useViewStore.getState().setView(view));
      expect(box.queryByRole('button', { name: 'Закрыть панель' })).toBeNull();
    }
    act(() => useViewStore.getState().setView('screens'));
    expect(useAppStore.getState().selectedPageId).toBe(id);
    expect(box.getByRole('button', { name: 'Закрыть панель' })).toBeTruthy();
  });

  test('Esc при открытом окне поверх (справка, лист) панель не закрывает', async () => {
    const { r, id } = await openWithSelection();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    r.container.append(dialog);
    esc();
    expect(useAppStore.getState().selectedPageId).toBe(id);
  });
});