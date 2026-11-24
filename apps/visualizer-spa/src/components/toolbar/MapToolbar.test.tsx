/**
 * Шапка как у пользователя: список карт, вкладки видов, поиск по центру, листы «Входы» и «Настройки» (тема — в настройках).
 * Карта — настоящая korbor-miniapp; сеть (каталог, API korbor, проверка TLS) — подмена fetch.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { useMapSourceStore } from '../../store/map-source-store';
import { useUiStore } from '../../store/ui-store';
import { useViewStore } from '../../store/view-store';
import { jsonResponse, mapText, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { MapToolbar } from '../MapToolbar';
import { listOptions, pickOption } from '../../test/select';
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
  test('нет вкладок; каталог грузится', () => {
    const { ui } = toolbar([], true);
    expect(ui.queryByRole('group', { name: 'Вид' })).toBeNull();
    const select = ui.getByTestId('map-select');
    expect(select.hasAttribute('data-disabled')).toBe(true);
    expect(within(select).getByText('Каталог…')).toBeTruthy();
  });

  test('выбор карты в селекте: загрузка, источник, toast, вход dogfood', async () => {
    const { ui } = toolbar();
    await pickOption(ui.getByTestId('map-select'), 'Korbor miniapp · 40 экр.');
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Загружено: Korbor miniapp · https://vite.localhost:5175'));
    expect(useAppStore.getState().document?.nodes.length).toBeGreaterThan(0);
    expect(useAppStore.getState().useTlsProxy).toBe(true);
    expect(useAppStore.getState().dogfoodAdminAccessToken).toBe('T');
    expect(useMapSourceStore.getState().source).toEqual({ kind: 'catalog', id: MINIAPP.id, label: MINIAPP.label, path: MINIAPP.path });
    expect(ui.getByRole('group', { name: 'Вид' })).toBeTruthy();
  });

  test('карта не загрузилась: понятная ошибка в баннере, без дубля во всплывающем', async () => {
    const { ui } = toolbar([EMPTY_ENTRY]);
    await pickOption(ui.getByTestId('map-select'), 'Пустая');
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
    expect(tabs).toEqual(['Экраны', 'Компоненты', 'API', 'База данных', 'Документация', 'Сравнение']);
    fireEvent.click(ui.getByTestId('view-api'));
    expect(useViewStore.getState().view).toBe('api');
    expect(ui.getByTestId('view-api').getAttribute('aria-pressed')).toBe('true');
  });

  test('очистить карту из списка', async () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    await pickOption(ui.getByTestId('map-select'), 'Очистить карту');
    expect(useAppStore.getState().document).toBeNull();
    expect(useAppStore.getState().toast).toBe('Карта очищена');
  });

  test('«Открыть JSON» в списке нажимает поле файла', async () => {
    const { ui, container } = toolbar();
    let clicked = 0;
    container.ownerDocument.getElementById('lam-file-input')?.addEventListener('click', () => { clicked += 1; });
    await pickOption(ui.getByTestId('map-select'), 'Открыть JSON / .appmap');
    expect(clicked).toBe(1);
  });

  test('без карты «Очистить карту» недоступно, с картой — доступно', async () => {
    const { ui } = toolbar();
    expect((await listOptions(ui.getByTestId('map-select'))).find((o) => o.label === 'Очистить карту')?.disabled).toBe(true);
    act(() => { openMap('korbor-miniapp'); });
    expect((await listOptions(ui.getByTestId('map-select'))).find((o) => o.label === 'Очистить карту')?.disabled).toBe(false);
  });

  test('шапка без дублей и крошек: «Источников» нет — карты в списке; выбор экрана крошек не добавляет', async () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    expect(ui.queryByRole('button', { name: 'Источники' })).toBeNull();
    expect((await listOptions(ui.getByTestId('map-select'))).map((o) => o.label)).toContain('Korbor miniapp · 40 экр.');
    const page = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page');
    act(() => useAppStore.getState().selectPage(page?.id ?? null));
    expect(ui.queryByTestId('breadcrumbs')).toBeNull();
  });

  test('лист «Входы»: профили входа шлюза, пользователи dev-входа грузятся при открытии', async () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Входы' }));
    expect(sheet.getByRole('alert').textContent).toContain('Шлюз живых экранов не отвечает');
    await waitFor(() => expect(net.calls.some((c) => c.url.endsWith('/api/v1/dev/dogfood/actors'))).toBe(true));
  });

  test('Esc закрывает лист: кнопка листа снова не раскрыта', () => {
    const { ui } = toolbar();
    const settings = ui.getByRole('button', { name: 'Настройки' });
    fireEvent.click(settings);
    expect(ui.getByRole('dialog', { name: 'Настройки просмотра' })).toBeTruthy();
    expect(settings.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
  });

  test('поиск по центру шапки открывает палитру; кнопки темы в шапке нет', () => {
    const { ui } = toolbar();
    const header = ui.getByTestId('toolbar');
    const search = ui.getByTestId('open-palette');
    expect([...header.children].indexOf(search.parentElement ?? search)).toBe(1);
    fireEvent.click(search);
    expect(useUiStore.getState().palette).toBe(true);
    expect(ui.queryByTestId('theme-toggle')).toBeNull();
  });

  test('тема — в настройках: тёмная и светлая', async () => {
    const { ui } = toolbar();
    act(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset['theme'] = 'dark'; });
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    expect(sheet.getByTestId('theme-dark').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sheet.getByTestId('theme-light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
    await waitFor(() => expect(sheet.getByTestId('theme-light').getAttribute('aria-pressed')).toBe('true'));
  });

  test('переключатель «Состояния»: включён по умолчанию, выключение убирает узлы-состояния с холста', async () => {
    openMap('korbor-miniapp');
    const screenId = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useAppStore.getState().setProjectStates(new Map([[screenId, [{ name: 'empty', id: 'empty', label: 'Пусто', kind: 'empty' as const }]]])));
    const stateId = `${screenId}@state:empty`;
    expect(useAppStore.getState().index?.nodesById.has(stateId)).toBe(true);
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    const sw = sheet.getByRole('switch', { name: 'Состояния' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    await waitFor(() => expect(useAppStore.getState().showStates).toBe(false));
    expect(useAppStore.getState().index?.nodesById.has(stateId)).toBe(false);
    fireEvent.click(sw);
    await waitFor(() => expect(useAppStore.getState().index?.nodesById.has(stateId)).toBe(true));
  });
});

describe('лист настроек', () => {
  test('простые настройки сверху, техника — под «Для разработчика»', () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const dialog = ui.getByRole('dialog', { name: 'Настройки просмотра' });
    const ui2 = within(dialog);
    expect(ui2.queryByRole('combobox', { name: 'Смотреть как' })).toBeNull();
    expect(ui2.queryByLabelText('Адрес приложения')).toBeNull();
    fireEvent.click(ui2.getByRole('button', { name: 'Для разработчика' }));
    expect(ui2.getByRole('combobox', { name: 'Сколько экранов живут одновременно' })).toBeTruthy();
    expect(ui2.getByRole('combobox', { name: 'Сколько экранов держать на паузе' })).toBeTruthy();
    expect(ui2.getByLabelText('Адрес приложения')).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/iframe|unmount|keep-alive|layout JSON|measure|miniapp/);
  });

  test('бюджет, масштаб, лимиты, базовый URL', async () => {
    openMap('korbor-miniapp');
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    const s = useAppStore.getState();
    expect(sheet.getByTestId('iframe-budget').textContent).toBe(`Живых экранов ${s.livePageIds.size} из ${s.maxLiveIframes} · на паузе ${s.warmPageIds.size} из ${s.maxWarmIframes} · закреплено 0`);
    await pickOption(sheet.getByRole('combobox', { name: 'Масштаб превью' }), '50%');
    expect(useAppStore.getState().iframeScale).toBe(0.5);
    fireEvent.click(sheet.getByRole('button', { name: 'Для разработчика' }));
    const live = sheet.getByRole('combobox', { name: 'Сколько экранов живут одновременно' });
    expect((await listOptions(live)).map((o) => o.label)).toContain('8 (по умолчанию)');
    await pickOption(live, 'Без предела (тяжело)');
    expect(useAppStore.getState().maxLiveIframes).toBe(9999);
    expect(sheet.getByTestId('iframe-budget').textContent).not.toContain(' из 9999');
    await pickOption(sheet.getByRole('combobox', { name: 'Сколько экранов держать на паузе' }), '0 — выгружать сразу');
    expect(useAppStore.getState().maxWarmIframes).toBe(0);
    fireEvent.change(sheet.getByLabelText('Адрес приложения'), { target: { value: 'http://localhost:5175' } });
    fireEvent.blur(sheet.getByLabelText('Адрес приложения'));
    expect(useAppStore.getState().baseUrlOverride).toBe('http://localhost:5175');
    const adaptive = sheet.getByTestId('map-adaptive-select');
    expect(adaptive.hasAttribute('data-disabled')).toBe(false);
    const tablet = (await listOptions(adaptive)).find((o) => o.label.includes('планшет'))?.label ?? '';
    await pickOption(adaptive, tablet);
    expect(mapAdaptive(useAppStore.getState().document?.layout).presetId).toBe('w768');
  });

  test('без лимита в store — без «из N»; размер экранов без карты недоступен', () => {
    act(() => useAppStore.setState({ maxWarmIframes: 9999 }));
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    expect(sheet.getByTestId('iframe-budget').textContent).toContain('на паузе 0 · закреплено');
    expect(sheet.getByTestId('map-adaptive-select').hasAttribute('data-disabled')).toBe(true);
  });

  test('proxy и проверка TLS: toast и журнал', async () => {
    const { ui } = toolbar();
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    const sheet = within(ui.getByRole('dialog', { name: 'Настройки просмотра' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Для разработчика' }));
    fireEvent.click(sheet.getByRole('switch', { name: 'Прокси для экранов' }));
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
    fireEvent.click(ui.getByRole('button', { name: 'Для разработчика' }));
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
    await waitFor(() => expect(net.calls.length).toBeGreaterThan(0));
  });
});
