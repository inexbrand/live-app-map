/**
 * Шапка как у пользователя: вкладки видов, крошки, селект карты, листы «Входы» и «Настройки», тема.
 * Карта — настоящая korbor-miniapp; сеть (каталог, API korbor, проверка TLS) — подмена fetch.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { useMapSourceStore } from '../../store/map-source-store';
import { useUiStore } from '../../store/ui-store';
import { useViewStore } from '../../store/view-store';
import { jsonResponse, mapText, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { MapToolbar } from '../MapToolbar';
import { mapAdaptive } from './map-adaptive';

useDom();

const MINIAPP: MapCatalogEntry = { id: 'korbor-miniapp', label: 'Korbor miniapp', path: '/maps/korbor-miniapp.liveappmap.json', baseUrl: 'https://vite.localhost:5175', pageCount: 40 };
const EMPTY_ENTRY: MapCatalogEntry = { id: 'broken', label: 'Пустая', path: '/maps/broken.json', baseUrl: '', pageCount: 0 };

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  window.history.replaceState(null, '', '/');
  net = stubFetch((url) => {
    if (url === MINIAPP.path) {
      return new Response(mapText('korbor-miniapp'), { status: 200 });
    }
    if (url.endsWith('/api/v1/dev/dogfood/actors')) {
      return jsonResponse({ data: { actors: [{ id: 'a1', kind: 'admin', label: 'ops', role: 'admin' }] } });
    }
    if (url.endsWith('/api/v1/dev/dogfood/session')) {
      return jsonResponse({ data: { kind: 'admin', actorId: 'a1', label: 'ops', role: 'admin', accessToken: 'T' } });
    }
    if (url.startsWith('/__lam_tls_check')) {
      return jsonResponse({ ok: true, status: 200, message: 'cert ok' });
    }
    return undefined;
  });
});

afterEach(() => net.restore());

function toolbar(catalog: readonly MapCatalogEntry[] = [MINIAPP], loading = false) {
  const r = render(<MapToolbar catalog={catalog} catalogLoading={loading} />);
  return { ...r, ui: within(document.body) };
}

describe('шапка без карты', () => {
  test('нет вкладок и крошек; каталог грузится', () => {
    const { ui } = toolbar([], true);
    expect(ui.queryByRole('group', { name: 'Вид' })).toBeNull();
    expect(ui.queryByTestId('breadcrumbs')).toBeNull();
    const select = ui.getByTestId('map-select');
    expect(select).toHaveProperty('disabled', true);
    expect(within(select).getByText('Каталог…')).toBeTruthy();
  });

  test('выбор карты в селекте: загрузка, источник, toast, вход dogfood', async () => {
    const { ui } = toolbar();
    expect(ui.getByText('Korbor miniapp · 40 экр.')).toBeTruthy();
    fireEvent.change(ui.getByTestId('map-select'), { target: { value: MINIAPP.id } });
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Загружено: Korbor miniapp · https://vite.localhost:5175'));
    expect(useAppStore.getState().document?.nodes.length).toBeGreaterThan(0);
    expect(useAppStore.getState().useTlsProxy).toBe(true);
    expect(useAppStore.getState().dogfoodAdminAccessToken).toBe('T');
    expect(useMapSourceStore.getState().source).toEqual({ kind: 'catalog', id: MINIAPP.id, label: MINIAPP.label, path: MINIAPP.path });
    expect(ui.getByRole('group', { name: 'Вид' })).toBeTruthy();
  });

  test('карта не загрузилась: понятная ошибка в баннере, без дубля во всплывающем', async () => {
    const { ui } = toolbar([EMPTY_ENTRY]);
    expect(ui.getByText('Пустая')).toBeTruthy();
    fireEvent.change(ui.getByTestId('map-select'), { target: { value: EMPTY_ENTRY.id } });
    await waitFor(() => expect(useAppStore.getState().lastLoadError).toBe('Карта: файл /maps/broken.json не найден (HTTP 404). Выберите карту в списке сверху или проверьте путь.'));
    expect(useAppStore.getState().toast).toBeNull();
    expect(useMapSourceStore.getState().source).toBeNull();
  });

  test('ссылка ?map= выбирает карту каталога в селекте', async () => {
    window.history.replaceState(null, '', `/?map=${encodeURIComponent(MINIAPP.path)}`);
    toolbar();
    await waitFor(() => expect(useMapSourceStore.getState().source).toEqual({ kind: 'catalog', id: MINIAPP.id, label: MINIAPP.label, path: MINIAPP.path }));
  });

  test('открыть файл карты: источник — файл', async () => {
    const { ui, container } = toolbar();
    const input = container.ownerDocument.getElementById('lam-file-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('нет поля файла');
    }
    const file = new File([mapText('korbor-miniapp')], 'my.liveappmap.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(useMapSourceStore.getState().source).toEqual({ kind: 'file', name: 'my.liveappmap.json' }));
    expect(within(ui.getByTestId('map-select')).getByText('Файл: my.liveappmap.json')).toBeTruthy();
  });

  test('файл не карта: ошибка в баннере, всплывающего нет', async () => {
    const { container } = toolbar();
    const input = container.ownerDocument.getElementById('lam-file-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('нет поля файла');
    }
    fireEvent.change(input, { target: { files: [new File(['{oops'], 'bad.json', { type: 'application/json' })] } });
    await waitFor(() => expect(useAppStore.getState().lastLoadError).not.toBeNull());
    expect(useAppStore.getState().toast).toBeNull();
  });
});

describe('шапка с картой', () => {
  test('вкладки по содержимому карты; клик меняет вид', () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    const tabs = within(ui.getByRole('group', { name: 'Вид' })).getAllByRole('button').map((b) => b.textContent);
    expect(tabs).toEqual(['Экраны', 'API', 'База данных', 'Документация', 'Сравнение']);
    fireEvent.click(ui.getByTestId('view-api'));
    expect(useViewStore.getState().view).toBe('api');
    expect(ui.getByTestId('view-api').getAttribute('aria-pressed')).toBe('true');
  });

  test('крошки экрана: группа и экран; клик по корню снимает выбор', () => {
    const doc = openMap('korbor-site');
    const page = doc.nodes.find((n) => n.kind === 'page' && (n.groupIds?.length ?? 0) > 0);
    const group = doc.groups?.find((g) => page?.groupIds?.includes(g.id) === true);
    if (page === undefined || group === undefined) {
      throw new Error('в карте сайта нет экрана в группе');
    }
    act(() => useAppStore.getState().selectPage(page.id));
    const { ui } = toolbar();
    const crumbs = within(ui.getByTestId('breadcrumbs'));
    expect(crumbs.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Экраны', group.title, page.title]);
    expect(crumbs.getByText(page.title).getAttribute('aria-current')).toBe('page');
    fireEvent.click(crumbs.getByRole('button', { name: 'Экраны' }));
    expect(useAppStore.getState().selectedPageId).toBeNull();
  });

  test('крошки API и таблицы; корень сбрасывает выбор', () => {
    const doc = openMap('korbor-miniapp');
    const route = doc.code?.routes[0];
    const table = doc.code?.tables[0];
    if (route === undefined || table === undefined) {
      throw new Error('в карте нет кода');
    }
    const { ui } = toolbar();
    act(() => useViewStore.getState().openRoute(route.id));
    const crumbs = () => within(ui.getByTestId('breadcrumbs'));
    expect(crumbs().getByText(`${route.method} ${route.path}`).getAttribute('title')).toBe(route.location.file);
    fireEvent.click(crumbs().getByRole('button', { name: 'API' }));
    expect(useViewStore.getState().route).toBeNull();
    act(() => useViewStore.getState().openTable(table.exportName));
    expect(crumbs().getByText(table.name)).toBeTruthy();
    fireEvent.click(crumbs().getByRole('button', { name: 'База данных' }));
    expect(useViewStore.getState().table).toBeNull();
    act(() => useViewStore.getState().setView('compare'));
    expect(ui.queryByTestId('breadcrumbs')).toBeNull();
  });

  test('крошки документации: эпоха и файл, заметка, граф', () => {
    const doc = openMap('korbor-miniapp');
    const epoch = doc.docs?.epochs[1];
    const note = doc.docs?.notes[0] ?? doc.docs?.guides[0];
    if (epoch === undefined || note === undefined) {
      throw new Error('в карте нет документации');
    }
    const { ui } = toolbar();
    const items = () => within(ui.getByTestId('breadcrumbs')).getAllByRole('listitem').map((li) => li.textContent);
    act(() => useViewStore.getState().setView('docs'));
    expect(items()[1]).toBe(doc.docs?.epochs[0]?.slug);
    act(() => useViewStore.getState().openDoc(epoch.dir));
    expect(items()).toHaveLength(3);
    expect(items()[1]).toBe(epoch.slug);
    const second = epoch.files[1]?.path;
    if (second !== undefined) {
      act(() => useViewStore.getState().openDoc(second));
      expect(items()).toHaveLength(3);
    }
    fireEvent.click(within(ui.getByTestId('breadcrumbs')).getByRole('button', { name: epoch.slug }));
    expect(useViewStore.getState().doc).toBe(epoch.dir);
    act(() => useViewStore.getState().openDoc(note.path));
    expect(items()).toEqual(['Документация', note.title]);
    act(() => useViewStore.getState().openDoc('нет/такого.md'));
    expect(items()).toEqual(['Документация', 'нет/такого.md']);
    act(() => useViewStore.getState().setDocsMode('graph'));
    expect(items()).toEqual(['Документация', 'Граф']);
    act(() => useDocGraphStore.setState({ selected: 'epoch:docs/epoch/x/y' }));
    expect(items()).toEqual(['Документация', 'Граф', 'y']);
    fireEvent.click(within(ui.getByTestId('breadcrumbs')).getByRole('button', { name: 'Документация' }));
    expect(useViewStore.getState().docsMode).toBe('text');
  });

  test('крошка «назад» — история браузера', () => {
    const doc = openMap('korbor-miniapp');
    act(() => useAppStore.getState().selectPage(doc.nodes.find((n) => n.kind === 'page')?.id ?? null));
    const { ui } = toolbar();
    let back = 0;
    const original = window.history.back.bind(window.history);
    window.history.back = () => { back += 1; };
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }));
    window.history.back = original;
    expect(back).toBe(1);
  });

  test('очистить карту из селекта', () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    fireEvent.change(ui.getByTestId('map-select'), { target: { value: '__clear__' } });
    expect(useAppStore.getState().document).toBeNull();
    expect(useAppStore.getState().toast).toBe('Карта очищена');
  });

  test('«Открыть JSON» в селекте нажимает поле файла', () => {
    const { ui, container } = toolbar();
    let clicked = 0;
    container.ownerDocument.getElementById('lam-file-input')?.addEventListener('click', () => { clicked += 1; });
    fireEvent.change(ui.getByTestId('map-select'), { target: { value: '__open_file__' } });
    fireEvent.change(ui.getByTestId('map-select'), { target: { value: '' } });
    expect(clicked).toBe(1);
  });

  test('шапка без дублей: «Источников» нет — карты в селекте; крошка из одной вкладки не показывается', () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    expect(ui.queryByRole('button', { name: 'Источники' })).toBeNull();
    expect(within(ui.getByTestId('map-select')).getByRole('option', { name: 'Korbor miniapp · 40 экр.' })).toBeTruthy();
    expect(ui.queryByTestId('breadcrumbs')).toBeNull();
    const page = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page');
    act(() => useAppStore.getState().selectPage(page?.id ?? null));
    expect(within(ui.getByTestId('breadcrumbs')).getByText(page?.title ?? '')).toBeTruthy();
  });

  test('лист «Входы»: профили входа шлюза, пользователи dev-входа грузятся при открытии', async () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Входы' }));
    expect(sheet.getByRole('status').textContent).toContain('Шлюз живых экранов не отвечает');
    await waitFor(() => expect(net.calls.some((c) => c.url.endsWith('/api/v1/dev/dogfood/actors'))).toBe(true));
  });

  test('Esc и повторный клик закрывают лист', () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    expect(ui.getByRole('dialog', { name: 'Настройки просмотра' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ui.queryByRole('dialog')).toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    expect(ui.queryByRole('dialog')).toBeNull();
  });

  test('поиск открывает палитру; тема переключается', () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByTestId('open-palette'));
    expect(useUiStore.getState().palette).toBe(true);
    document.documentElement.dataset['theme'] = 'dark';
    const theme = ui.getByTestId('theme-toggle');
    expect(theme.getAttribute('aria-label')).toBe('Светлая тема');
    fireEvent.click(theme);
    expect(document.documentElement.dataset['theme']).toBe('light');
    return waitFor(() => expect(ui.getByTestId('theme-toggle').getAttribute('aria-label')).toBe('Тёмная тема'));
  });
});

describe('лист настроек', () => {
  test('простые настройки сверху, техника — под «Для разработчика»', () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const dialog = ui.getByRole('dialog', { name: 'Настройки просмотра' });
    const dev = dialog.querySelector('details');
    expect(dev?.querySelector('summary')?.textContent).toBe('Для разработчика');
    expect(dev?.open).toBe(false);
    for (const tech of ['Сколько экранов живут одновременно', 'Сколько экранов держать на паузе', 'Адрес приложения']) {
      expect(dev?.contains(within(dialog).getByLabelText(tech))).toBe(true);
    }
    expect(dev?.contains(within(dialog).getByLabelText('Смотреть как'))).toBe(false);
    expect(dialog.textContent).not.toMatch(/iframe|unmount|keep-alive|layout JSON|measure|miniapp/);
  });

  test('бюджет, масштаб, лимиты, роль, базовый URL', async () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    const s = useAppStore.getState();
    expect(sheet.getByTestId('iframe-budget').textContent).toBe(`Живых экранов ${s.livePageIds.size} из ${s.maxLiveIframes} · на паузе ${s.warmPageIds.size} из ${s.maxWarmIframes} · закреплено 0`);
    fireEvent.change(sheet.getByLabelText('Масштаб превью'), { target: { value: '0.5' } });
    expect(useAppStore.getState().iframeScale).toBe(0.5);
    fireEvent.change(sheet.getByLabelText('Сколько экранов живут одновременно'), { target: { value: '9999' } });
    expect(useAppStore.getState().maxLiveIframes).toBe(9999);
    expect(sheet.getByTestId('iframe-budget').textContent).not.toContain(' из 9999');
    fireEvent.change(sheet.getByLabelText('Сколько экранов держать на паузе'), { target: { value: '0' } });
    expect(useAppStore.getState().maxWarmIframes).toBe(0);
    expect(within(sheet.getByLabelText('Сколько экранов держать на паузе')).getByText('0 — выгружать сразу')).toBeTruthy();
    expect(within(sheet.getByLabelText('Сколько экранов живут одновременно')).getByText('8 (по умолчанию)')).toBeTruthy();
    fireEvent.change(sheet.getByLabelText('Смотреть как'), { target: { value: 'employer' } });
    expect(useAppStore.getState().globalRole).toBe('employer');
    fireEvent.change(sheet.getByLabelText('Адрес приложения'), { target: { value: 'http://localhost:5175' } });
    fireEvent.blur(sheet.getByLabelText('Адрес приложения'));
    expect(useAppStore.getState().baseUrlOverride).toBe('http://localhost:5175');
    const adaptive = sheet.getByTestId('map-adaptive-select');
    expect(adaptive).toHaveProperty('disabled', false);
    fireEvent.change(adaptive, { target: { value: 'w768' } });
    expect(mapAdaptive(useAppStore.getState().document?.layout).presetId).toBe('w768');
  });

  test('без лимита в store — без «из N»; масштаб не из списка не меняется', () => {
    act(() => useAppStore.setState({ maxWarmIframes: 9999 }));
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    expect(sheet.getByTestId('iframe-budget').textContent).toContain('на паузе 0 · закреплено');
    expect(sheet.getByTestId('map-adaptive-select')).toHaveProperty('disabled', true);
    const before = useAppStore.getState().iframeScale;
    const scale = sheet.getByLabelText('Масштаб превью');
    const odd = document.createElement('option');
    odd.value = '0.6';
    scale.appendChild(odd);
    fireEvent.change(scale, { target: { value: '0.6' } });
    expect(useAppStore.getState().iframeScale).toBe(before);
  });

  test('proxy и проверка TLS: toast и журнал', async () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    fireEvent.click(sheet.getByRole('checkbox'));
    expect(useAppStore.getState().useTlsProxy).toBe(!useAppStore.getInitialState().useTlsProxy);
    fireEvent.click(sheet.getByRole('button', { name: 'Проверить TLS origin' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('TLS OK · HTTP 200 · cert ok'));
    expect(net.calls.find((c) => c.url.startsWith('/__lam_tls_check'))?.url).toBe(`/__lam_tls_check?url=${encodeURIComponent('https://vite.localhost:5175/')}`);
    expect(useAppStore.getState().logs.at(-1)?.message).toBe('TLS OK · HTTP 200 · cert ok');
    const opened: string[] = [];
    const original = window.open;
    window.open = (url) => { opened.push(String(url)); return null; };
    act(() => useAppStore.getState().setBaseUrlOverride('http://localhost:5175'));
    fireEvent.click(sheet.getByRole('button', { name: 'Открыть origin (доверие cert)' }));
    window.open = original;
    expect(opened).toEqual(['http://localhost:5175']);
  });

  test('проверка TLS: сеть недоступна и ошибка проверки', async () => {
    net.restore();
    net = stubFetch((url) => (url.startsWith('/__lam_tls_check') ? jsonResponse({ ok: false, error: 'self-signed' }) : undefined));
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    fireEvent.click(ui.getByRole('button', { name: 'Проверить TLS origin' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('TLS fail · self-signed'));
    expect(useAppStore.getState().logs.at(-1)?.level).toBe('warn');
    net.restore();
    net = stubFetch(() => { throw new Error('offline'); });
    fireEvent.click(ui.getByRole('button', { name: 'Проверить TLS origin' }));
    await waitFor(() => expect(useAppStore.getState().toast).toContain('TLS check: '));
  });

  test('API korbor недоступен: ошибка списка пользователей', async () => {
    net.restore();
    net = stubFetch(() => new Response('', { status: 500 }));
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    await waitFor(() => expect(net.calls.length).toBeGreaterThan(0));
  });
});
