/**
 * Корневой shell как у пользователя: каталог карт, выбор карты, ссылка ?map=,
 * перетаскивание файла, ошибки загрузки и Esc, предупреждения разбора, фильтр
 * холста, смена видов. Сеть — по адресу: каталог, файлы карт из public/maps.
 */
import { useDom } from './test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StrictMode } from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { useAppStore } from './store/app-store';
import { useMapSourceStore } from './store/map-source-store';
import { useViewStore } from './store/view-store';
import { jsonResponse, mapJson, mapText, resetStores, stubFetch, type FetchRoute } from './test/fixtures';

useDom();

const CATALOG = {
  version: 1,
  maps: [
    { id: 'korbor-miniapp', label: 'Korbor мини-апп', path: '/maps/korbor-miniapp.liveappmap.json', baseUrl: 'http://localhost:5175', pageCount: 12 },
    { id: 'live-app-map', label: 'Live App Map', path: '/maps/live-app-map.liveappmap.json', baseUrl: '', pageCount: 0 },
  ],
};

let net: ReturnType<typeof stubFetch>;
let extra: FetchRoute = () => undefined;

beforeEach(() => {
  resetStores();
  window.history.replaceState(null, '', '/');
  extra = () => undefined;
  net = stubFetch((url, init) => {
    const own = extra(url, init);
    if (own !== undefined) {
      return own;
    }
    if (url.endsWith('/maps/index.json')) {
      return jsonResponse(CATALOG);
    }
    const m = /\/maps\/([\w-]+)\.liveappmap\.json$/.exec(url);
    if (m?.[1] === 'korbor-miniapp' || m?.[1] === 'live-app-map') {
      return jsonResponse(mapJson(m[1]));
    }
    return undefined;
  });
});

afterEach(() => net.restore());

describe('shell', () => {
  test('каталог: выбор карты загружает её, источник и toast с адресом приложения', async () => {
    const r = render(<App />);
    const box = within(r.container);
    const user = userEvent.setup({ document });
    const pick = (name: string) => box.getByRole('button', { name });
    await waitFor(() => expect(pick('Korbor мини-апп')).toBeTruthy());
    expect(pick('Korbor мини-апп').getAttribute('title')).toBe('/maps/korbor-miniapp.liveappmap.json · 12 экранов');
    expect(pick('Live App Map').getAttribute('title')).toBe('/maps/live-app-map.liveappmap.json');
    await user.click(pick('Korbor мини-апп'));
    await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
    expect(useMapSourceStore.getState().source).toEqual({ kind: 'catalog', id: 'korbor-miniapp', label: 'Korbor мини-апп', path: '/maps/korbor-miniapp.liveappmap.json' });
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Korbor мини-апп · http://localhost:5175'));
  });

  test('каталог недоступен — причина и подсказка; карта не загрузилась — баннер, Esc и крестик закрывают', async () => {
    extra = (url) => (url.endsWith('/maps/index.json') ? new Response('нет', { status: 500 }) : url.endsWith('/maps/broken.liveappmap.json') ? new Response('нет', { status: 404 }) : undefined);
    window.history.replaceState(null, '', '/?map=/maps/broken.liveappmap.json');
    const r = render(<App />);
    const box = within(r.container);
    await waitFor(() => expect(box.getByText(/Каталог карт/)).toBeTruthy());
    expect(box.getByText(/Каталог пуст/)).toBeTruthy();
    await waitFor(() => expect(box.getByRole('alert').textContent).toContain('HTTP 404'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(box.queryByRole('alert')).toBeNull();
    act(() => useAppStore.getState().setLastLoadError('сломано'));
    fireEvent.click(within(box.getByRole('alert')).getByRole('button'));
    expect(box.queryByRole('alert')).toBeNull();
  });

  test('ссылка ?map=&baseUrl=&role= открывает карту с адресом и ролью', async () => {
    window.history.replaceState(null, '', '/?map=/maps/korbor-miniapp.liveappmap.json&baseUrl=http://localhost:5999&role=admin');
    render(<App />);
    await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
    expect(useAppStore.getState().baseUrlOverride).toBe('http://localhost:5999');
    expect(useAppStore.getState().globalRole).toBe('admin');
    expect(useAppStore.getState().mode).toBe('live');
  });

  test('ссылка ?map= под StrictMode: карта грузится один раз — выбранный экран не сбрасывается повторной загрузкой', async () => {
    window.history.replaceState(null, '', '/?map=/maps/korbor-miniapp.liveappmap.json');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
    await act(async () => {
      await Bun.sleep(50);
    });
    expect(useAppStore.getState().logs.filter((l) => l.message.startsWith('Карта загружена'))).toHaveLength(1);
  });

  test('ссылка ?map= без сети — текст ошибки в баннере', async () => {
    extra = (url) => {
      if (url.endsWith('/maps/x.json')) {
        throw new Error('сеть упала');
      }
      return undefined;
    };
    window.history.replaceState(null, '', '/?map=/maps/x.json');
    const r = render(<App />);
    await waitFor(() => expect(within(r.container).getByRole('alert').textContent).toContain('сеть упала'));
  });

  test('перетащили файл карты — карта открыта, источник — файл; не JSON — ошибка', async () => {
    const r = render(<App />);
    const shell = r.container.querySelector('.app-shell');
    if (shell === null) {
      throw new Error('нет shell');
    }
    fireEvent.dragOver(shell);
    expect(shell.className).toContain('app-shell--drag');
    fireEvent.dragLeave(shell);
    expect(shell.className).not.toContain('app-shell--drag');
    const drop = async (file: File | null): Promise<void> => {
      await act(async () => {
        fireEvent.drop(shell, { dataTransfer: { files: file === null ? [] : [file] } });
        await new Promise((done) => setTimeout(done, 30));
      });
    };
    await drop(null);
    await drop(new File(['не json'], 'bad.json', { type: 'application/json' }));
    await waitFor(() => expect(within(r.container).getByRole('alert')).toBeTruthy());
    await drop(new File([mapText('korbor-miniapp')], 'korbor.liveappmap.json', { type: 'application/json' }));
    await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
    expect(useMapSourceStore.getState().source).toEqual({ kind: 'file', name: 'korbor.liveappmap.json' });
  });

  test('карта открыта: фильтр холста и «Показать все», виды API, База, Документация, Сравнение', async () => {
    window.history.replaceState(null, '', '/?map=/maps/korbor-miniapp.liveappmap.json');
    const r = render(<App />);
    const box = within(r.container);
    await waitFor(() => expect(useAppStore.getState().document).not.toBeNull());
    act(() => useAppStore.getState().setSearchQuery('vacancies'));
    expect(box.getByTestId('canvas-filter').textContent).toContain('«vacancies»');
    fireEvent.click(box.getByText('Показать все'));
    expect(box.queryByTestId('canvas-filter')).toBeNull();
    for (const view of ['api', 'database', 'docs', 'compare', 'screens'] as const) {
      act(() => useViewStore.getState().setView(view));
      expect(r.container.querySelector('.canvas-wrap')).not.toBeNull();
    }
  });

  test('предупреждения разбора показаны над холстом', async () => {
    const raw = mapJson('korbor-miniapp');
    const r = render(<App />);
    act(() => {
      useAppStore.getState().loadUnknownJson(raw);
      useAppStore.setState({ parseIssues: [{ severity: 'warning', code: 'x', message: 'странное поле', path: 'nodes.0' }] });
    });
    expect(within(r.container).getByText(/Предупреждения parse \(1\)/)).toBeTruthy();
    expect(within(r.container).getByText('странное поле · nodes.0')).toBeTruthy();
  });
});
