/**
 * Панель логов, адрес страницы и образцы параметров как у пользователя:
 * - логи: счётчики, фильтр по экрану, очистка, сброс фильтра;
 * - адрес: вид и роут — новая запись истории, экран — замена, «назад» возвращает место,
 *   экран из адреса при открытии карты;
 * - образцы: без шлюза запросов нет, со шлюзом — списки под профилем приложения.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useNavHistory } from '../lib/use-nav-history';
import { useRouteSamples } from '../lib/use-route-samples';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';
import { useViewStore } from '../store/view-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { DiagnosticsDock } from './DiagnosticsDock';

useDom();

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  window.history.replaceState(null, '', '/');
  net = stubFetch((url) => (url.includes('/sample-ids') ? jsonResponse({ ok: true, values: {} }) : undefined));
});

afterEach(() => net.restore());

describe('логи и статус', () => {
  test('кнопка открывает панель: счётчики, роль, фильтр по экрану, очистка и сброс', async () => {
    const doc = openMap('korbor-miniapp');
    const pages = doc.nodes.filter((n) => n.kind === 'page');
    const first = pages[0]?.id ?? '';
    act(() => {
      useAppStore.getState().setGlobalRole('recruiter');
      useAppStore.getState().pushLog({ level: 'info', source: first, message: 'экран первый' });
      useAppStore.getState().pushLog({ level: 'error', source: pages[1]?.id ?? '', message: 'экран второй' });
    });
    const r = render(<DiagnosticsDock />);
    const box = within(r.container.ownerDocument.body);
    expect(box.getByLabelText('Открыть логи и статус').textContent).toBe(String(useAppStore.getState().logs.length));
    fireEvent.click(box.getByLabelText('Открыть логи и статус'));
    const stats = r.container.ownerDocument.querySelector('.diag-stats')?.textContent ?? '';
    expect(stats).toContain('роль рекрутер');
    expect(stats).toContain(`экранов ${pages.length}`);
    expect(stats).toMatch(/live \d+\/\d+/);
    fireEvent.change(box.getByLabelText('Фильтр по экрану'), { target: { value: first } });
    const lines = () => [...r.container.ownerDocument.querySelectorAll('.diag-log-line__msg')].map((el) => el.textContent);
    expect(lines()).toContain('экран первый');
    expect(lines()).not.toContain('экран второй');
    // Системные события видны при любом фильтре
    expect(lines()).toContain(useAppStore.getState().logs.find((l) => l.source === 'system')?.message ?? 'нет системных событий');
    fireEvent.click(box.getByText('Сбросить фильтр'));
    expect(lines()).toContain('экран второй');
    fireEvent.change(box.getByLabelText('Фильтр по экрану'), { target: { value: '' } });
    expect(useAppStore.getState().logFilterPageId).toBeNull();
    fireEvent.click(box.getByText('Очистить лог'));
    expect(box.getByText('Пока пусто — загрузите карту или live.')).toBeTruthy();
  });

  test('без карты и с безлимитом: «—» вместо роли, счётчики без предела', () => {
    act(() => useAppStore.setState({ maxLiveIframes: 9999, maxWarmIframes: 9999, globalRole: 'employer' }));
    const r = render(<DiagnosticsDock />);
    fireEvent.click(within(r.container).getByLabelText('Открыть логи и статус'));
    const stats = r.container.ownerDocument.querySelector('.diag-stats')?.textContent ?? '';
    expect(stats).toContain('live 0warm 0');
    expect(stats).toContain('роль клиент');
    expect(stats).toContain('экранов 0');
    act(() => useAppStore.setState({ globalRole: 'guest' }));
    expect(r.container.ownerDocument.querySelector('.diag-stats')?.textContent).toContain('роль —');
  });
});

function Nav() {
  useNavHistory();
  return null;
}

describe('адрес страницы', () => {
  test('вид — новая запись истории, экран — замена; «назад» возвращает вид', async () => {
    const doc = openMap('korbor-miniapp');
    render(<Nav />);
    const depth = window.history.length;
    act(() => useViewStore.getState().setView('api'));
    expect(window.location.search).toBe('?view=api');
    expect(window.history.length).toBe(depth + 1);
    act(() => useViewStore.getState().setView('screens'));
    const page = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    const before = window.history.length;
    act(() => useAppStore.getState().selectPage(page));
    expect(window.location.search).toContain('screen=');
    expect(window.history.length).toBe(before);
    act(() => {
      window.history.replaceState(null, '', '/?view=database');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useViewStore.getState().view).toBe('database');
    expect(useAppStore.getState().selectedPageId).toBeNull();
  });

  test('экран из адреса выбирается при открытии карты; неизвестный — нет', () => {
    const doc = openMap('korbor-miniapp');
    const page = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    window.history.replaceState(null, '', `/?screen=${encodeURIComponent(page)}`);
    const r = render(<Nav />);
    expect(useAppStore.getState().selectedPageId).toBe(page);
    r.unmount();
    act(() => useAppStore.getState().selectPage(null));
    window.history.replaceState(null, '', '/?screen=нет-такого');
    render(<Nav />);
    expect(useAppStore.getState().selectedPageId).toBeNull();
  });
});

function Samples() {
  useRouteSamples();
  return null;
}

describe('образцы параметров маршрутов', () => {
  test('без шлюза запросов нет; со шлюзом и профилем — списки под профилем приложения', async () => {
    const doc = openMap('korbor-miniapp');
    render(<Samples />);
    expect(net.calls.filter((c) => c.url.includes('/sample-ids'))).toEqual([]);
    const origin = new URL(doc.baseUrl ?? '').origin;
    act(() => {
      useGatewayStore.setState({
        port: 4320,
        profiles: [{ id: 'rec', label: 'Рекрутер', role: 'recruiter', origins: [{ origin, cookies: [], storageKeys: ['token'] }], updatedAt: '2026-11-22T00:00:00Z' }],
      });
      useAppStore.getState().setGlobalRole('recruiter');
    });
    await waitFor(() => expect(net.calls.some((c) => c.url.startsWith('/__lam_sessions/rec/sample-ids'))).toBe(true));
  });
});
