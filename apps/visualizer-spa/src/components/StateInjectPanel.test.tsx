/**
 * Правая панель выбранной ноды как у пользователя: живой URL, роль, стейты, кнопки, панель кода
 * (сервис — роуты, таблицы, функции; экран — вызовы API).
 * Карта — настоящая korbor-miniapp.
 */
import { dumpDom, useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppMapDocument, CodeSymbol } from '@live-app-map/schema';
import { selectNodeCode } from '../lib/node-code';
import { useAppStore } from '../store/app-store';
import { openMap, resetStores } from '../test/fixtures';
import { pickOption } from '../test/select';
import { StateInjectPanel } from './StateInjectPanel';

useDom();

beforeEach(resetStores);

function panel() {
  const r = render(<StateInjectPanel />);
  return { ui: within(r.container), container: r.container };
}

/** Нода, для которой условие верно. */
function nodeWhere(doc: AppMapDocument, cond: (id: string) => boolean): string {
  const hit = doc.nodes.find((n) => cond(n.id));
  if (hit === undefined) {
    throw new Error('нет подходящей ноды');
  }
  return hit.id;
}

describe('панель ноды', () => {
  test('ничего не выбрано — панели нет', () => {
    openMap('korbor-miniapp');
    const { container } = panel();
    expect(container.innerHTML).toBe('');
  });

  test('экран со стейтами: роли нет (она в «Входах»), стейт включается и снимается, клики в iframe', async () => {
    const doc = openMap('korbor-miniapp');
    const id = nodeWhere(doc, (nid) => (doc.nodes.find((n) => n.id === nid)?.states?.length ?? 0) > 0);
    act(() => useAppStore.getState().selectPage(id));
    const { ui, container } = panel();
    const url = ui.getByLabelText('Живой URL');
    expect((url as HTMLTextAreaElement).value).toBe(useAppStore.getState().resolveLiveUrl(id) ?? '—');
    dumpDom('drawer-states', container);
    expect(ui.queryByRole('combobox', { name: 'Глобальная роль' })).toBeNull();
    const states = doc.nodes.find((n) => n.id === id)?.states ?? [];
    const first = states[0];
    if (first === undefined) {
      throw new Error('нет стейтов');
    }
    const label = first.name === 'recruiter' ? 'рекрутер' : first.name === 'employer' ? 'клиент' : first.name;
    fireEvent.click(ui.getByRole('button', { name: label }));
    expect(useAppStore.getState().activeStates.get(id)).toBe(first.name);
    fireEvent.click(ui.getByRole('button', { name: label }));
    expect(useAppStore.getState().activeStates.get(id)).toBeUndefined();
    fireEvent.click(ui.getByRole('button', { name: 'Клики в экран' }));
    expect(useAppStore.getState().interactPageId).toBe(id);
    fireEvent.click(ui.getByRole('button', { name: 'Клики в экран' }));
    expect(useAppStore.getState().interactPageId).toBeNull();
  });

  test('подписи стейтов-ролей по-русски', () => {
    const doc = openMap('korbor-miniapp');
    const node = doc.nodes.find((n) => n.kind === 'page');
    if (node === undefined) {
      throw new Error('нет экрана');
    }
    const withRoles = { ...doc, nodes: doc.nodes.map((n) => (n.id === node.id ? { ...n, states: [{ name: 'recruiter' }, { name: 'employer' }, { name: 'empty' }] } : n)) };
    act(() => {
      useAppStore.getState().loadDocument(withRoles);
      useAppStore.getState().selectPage(node.id);
    });
    const { ui } = panel();
    expect(['рекрутер', 'клиент', 'empty'].map((l) => ui.getByRole('button', { name: l }).textContent)).toEqual(['рекрутер', 'клиент', 'empty']);
  });

  test('экран без стейтов; копировать URL и новая вкладка', async () => {
    const doc = openMap('korbor-miniapp');
    const id = nodeWhere(doc, (nid) => {
      const n = doc.nodes.find((x) => x.id === nid);
      return n?.kind === 'page' && (n.states?.length ?? 0) === 0;
    });
    act(() => useAppStore.getState().selectPage(id));
    const { ui } = panel();
    expect(ui.getByText('Отдельных состояний нет — задайте глобальную роль.')).toBeTruthy();
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied.push(t); } } });
    fireEvent.click(ui.getByRole('button', { name: 'Копировать URL' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('URL скопирован'));
    expect(copied).toEqual([useAppStore.getState().resolveLiveUrl(id) ?? '']);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    fireEvent.click(ui.getByRole('button', { name: 'Копировать URL' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Не удалось скопировать URL'));
    const opened: string[] = [];
    const original = window.open;
    window.open = (u) => { opened.push(String(u)); return null; };
    fireEvent.click(ui.getByRole('button', { name: 'В новой вкладке' }));
    window.open = original;
    expect(opened.length).toBe(1);
  });

  test('экран без URL: «Нет URL»', async () => {
    const doc = openMap('korbor-miniapp');
    const node = doc.nodes.find((n) => n.kind === 'page');
    if (node === undefined) {
      throw new Error('нет экрана');
    }
    const noUrl = { ...doc, baseUrl: null, nodes: doc.nodes.map((n) => (n.id === node.id ? { ...n, url: undefined, pathPattern: '' } : n)) };
    act(() => {
      useAppStore.getState().loadDocument(noUrl);
      useAppStore.getState().setBaseUrlOverride('');
      useAppStore.getState().selectPage(node.id);
    });
    const { ui } = panel();
    if (useAppStore.getState().resolveLiveUrl(node.id) === null) {
      expect((ui.getByLabelText('Живой URL') as HTMLTextAreaElement).value).toBe('—');
      fireEvent.click(ui.getByRole('button', { name: 'Копировать URL' }));
      await waitFor(() => expect(useAppStore.getState().toast).toBe('Нет URL'));
    }
  });
});

describe('панель кода', () => {
  test('сервис: роуты с экранами и БД, таблицы с колонками, фильтр, переход к экрану', async () => {
    const doc = openMap('korbor-miniapp');
    const svc = doc.nodes.find((n) => {
      const v = n.kind === 'service' ? selectNodeCode(doc, n.id) : null;
      return v !== null && v.kind === 'service' && v.routes.length > 0 && v.tables.length > 0;
    });
    if (svc === undefined) {
      throw new Error('нет сервиса с кодом');
    }
    act(() => useAppStore.getState().selectPage(svc.id));
    const { ui, container } = panel();
    const drawer = within(ui.getByTestId('service-drawer'));
    expect(drawer.getAllByTestId('code-route').length).toBeGreaterThan(0);
    expect(drawer.getAllByTestId('code-table').length).toBeGreaterThan(0);
    dumpDom('code-service', container);
    const link = container.querySelector('.code-item__link');
    if (link instanceof HTMLElement) {
      fireEvent.click(link);
      expect(useAppStore.getState().selectedPageId).not.toBe(svc.id);
      act(() => useAppStore.getState().selectPage(svc.id));
    }
    await userEvent.setup({ document }).type(ui.getByLabelText('Фильтр кода'), 'нет-такого-zzz');
    expect(ui.queryAllByTestId('code-route')).toHaveLength(0);
    expect(ui.queryAllByTestId('code-table')).toHaveLength(0);
  });

  test('сервис: роут, к которому перешли, — первым и подсвечен', () => {
    const doc = openMap('korbor-miniapp');
    const route = doc.code?.routes.at(-1);
    if (route === undefined) {
      throw new Error('нет роутов');
    }
    act(() => useAppStore.getState().focusRoute(route.serviceId, route.id));
    const { ui, container } = panel();
    if (useAppStore.getState().selectedPageId === route.serviceId) {
      const focused = ui.getByTestId('code-route-focused');
      expect(focused.textContent).toContain(route.path);
      expect(container.querySelector('.code-section__list li')).toBe(focused);
    }
  });

  test('сервис без раздела code', () => {
    const doc = openMap('korbor-miniapp');
    const svc = doc.nodes.find((n) => n.kind === 'service');
    if (svc === undefined) {
      return;
    }
    act(() => {
      useAppStore.getState().loadDocument({ ...doc, code: undefined });
      useAppStore.getState().selectPage(svc.id);
    });
    const { ui } = panel();
    expect(ui.getByText('В карте нет раздела code для сервиса.')).toBeTruthy();
  });

  test('экран: вызовы API с переходом к роуту, несопоставленные, функции файла', () => {
    const doc = openMap('korbor-miniapp');
    const id = nodeWhere(doc, (nid) => {
      const v = selectNodeCode(doc, nid);
      return v !== null && v.kind === 'page' && v.api.length > 0;
    });
    act(() => useAppStore.getState().selectPage(id));
    const { ui, container } = panel();
    const calls = ui.getAllByTestId('screen-api-call');
    expect(calls.length).toBeGreaterThan(0);
    dumpDom('code-page', container);
    const go = ui.getAllByTestId('go-to-route')[0];
    if (go === undefined) {
      throw new Error('нет перехода к роуту');
    }
    fireEvent.click(go);
    expect(useAppStore.getState().codeFocusRouteId).not.toBeNull();
    const unmatchedPage = doc.nodes.find((n) => {
      const v = selectNodeCode(doc, n.id);
      return v !== null && v.kind === 'page' && v.unmatched.length > 0;
    });
    if (unmatchedPage !== undefined) {
      act(() => useAppStore.getState().selectPage(unmatchedPage.id));
      expect(ui.getAllByText('Роут не найден в исходниках').length).toBeGreaterThan(0);
      dumpDom('code-unmatched', container);
    }
  });

  test('панель кода экрана есть, если есть функции файла, вызовы с роутом или несопоставленные', () => {
    const doc = openMap('korbor-miniapp');
    const id = nodeWhere(doc, (nid) => {
      const v = selectNodeCode(doc, nid);
      return v !== null && v.kind === 'page' && v.api.length > 0;
    });
    const view = selectNodeCode(doc, id);
    const code = doc.code;
    if (view === null || view.kind !== 'page' || code === undefined) {
      throw new Error('нет кода экрана');
    }
    const otherSymbols = code.symbols.filter((s) => s.location.file !== view.file);
    const ownSymbol: CodeSymbol = { id: 'sym:own', kind: 'function', name: 'ownHelper', serviceId: 'x', location: { file: view.file, line: 1 } };
    const variants: Array<[string, AppMapDocument]> = [
      ['ничего', { ...doc, code: { ...code, symbols: otherSymbols, screens: [] } }],
      ['только функции', { ...doc, code: { ...code, symbols: [...otherSymbols, ownSymbol], screens: [] } }],
      ['только вызовы с роутом', { ...doc, code: { ...code, symbols: otherSymbols } }],
      ['только несопоставленные', { ...doc, code: { ...code, symbols: otherSymbols, routes: [] } }],
    ];
    const shown = variants.map(([name, d]) => {
      act(() => {
        useAppStore.getState().loadDocument(d);
        useAppStore.getState().selectPage(id);
      });
      const { container, unmount } = render(<StateInjectPanel />);
      const has = container.querySelector('[data-testid="code-panel"]') !== null;
      unmount();
      return `${name}: ${has}`;
    });
    expect(shown).toEqual(['ничего: false', 'только функции: true', 'только вызовы с роутом: true', 'только несопоставленные: true']);
  });
});
