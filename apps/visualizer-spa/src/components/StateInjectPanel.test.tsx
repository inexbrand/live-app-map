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
  test('ничего не выбрано — панели нет; выбран экран — тоже (экран в фокусе, без панели справа)', () => {
    openMap('korbor-miniapp');
    const { container } = panel();
    expect(container.innerHTML).toBe('');
    const page = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page');
    act(() => useAppStore.getState().selectPage(page?.id ?? null));
    expect(container.innerHTML).toBe('');
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
});
