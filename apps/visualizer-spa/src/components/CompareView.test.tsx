/**
 * Вид «Сравнение» как у пользователя: выбор «было» и «стало» (открытая карта, файл на
 * диске, коммит, свежий скан, файл с компьютера), итог и разделы изменений, переходы.
 * Карты — настоящие из public/maps; dev-сервер истории — подмена fetch.
 */
import { dumpDom, useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMapSourceStore } from '../store/map-source-store';
import { useViewStore } from '../store/view-store';
import { jsonResponse, mapJson, openMap, resetStores, stubFetch, type FetchRoute } from '../test/fixtures';
import { CompareView } from './CompareView';

useDom();

const VERSIONS = [
  { ref: 'a1b2c3d4e5f6a7b8', date: '2026-11-21T17:13:00+03:00', subject: 'скан после правки' },
  { ref: 'b2c3d4e5f6a7b8c9', date: '2026-11-20T09:05:00+03:00', subject: 'первый скан' },
];

let net: ReturnType<typeof stubFetch> | null = null;

/** Сеть истории карт: по умолчанию — две версии, коммит и диск отдают сайт, скан — мини-апп. */
function history(over: FetchRoute = () => undefined): void {
  net = stubFetch((url, init) => {
    const own = over(url, init);
    if (own !== undefined) {
      return own;
    }
    if (url.startsWith('/__lam_maps/versions')) {
      return jsonResponse({ versions: [...VERSIONS, { ref: 1 }] });
    }
    if (url.startsWith('/__lam_maps/version?')) {
      return jsonResponse(mapJson('korbor-site'));
    }
    if (url.startsWith('/__lam_maps/scan')) {
      return jsonResponse(mapJson('korbor-miniapp'));
    }
    if (url === '/maps/korbor-miniapp.liveappmap.json') {
      return jsonResponse(mapJson('korbor-admin'));
    }
    return undefined;
  });
}

function catalog(): void {
  openMap('korbor-miniapp');
  useMapSourceStore.getState().setSource({ kind: 'catalog', id: 'korbor-miniapp', label: 'Korbor мини-апп', path: '/maps/korbor-miniapp.liveappmap.json' });
}

beforeEach(() => {
  resetStores();
  net = null;
});

afterEach(() => net?.restore());

function view() {
  const r = render(<CompareView />);
  return { ui: within(r.container), container: r.container };
}

function first<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) {
    throw new Error('пусто');
  }
  return x;
}

function picker(ui: ReturnType<typeof within>, side: 'left' | 'right'): HTMLSelectElement {
  const el = ui.getByTestId(`compare-${side}`);
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error('не select');
  }
  return el;
}

describe('вид «Сравнение»', () => {
  test('карта не открыта: обе стороны — ошибка', async () => {
    history();
    const { ui, container } = view();
    expect(ui.getByText('карта не открыта')).toBeTruthy();
    await waitFor(() => expect(ui.getAllByRole('alert')).toHaveLength(2));
    expect(ui.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Было: карта не открыта', 'Стало: карта не открыта']);
    dumpDom('cmp-none', container);
  });

  test('карта из файла: истории нет, версии совпадают', async () => {
    history();
    openMap('korbor-miniapp');
    useMapSourceStore.getState().setSource({ kind: 'file', name: 'my.liveappmap.json' });
    const { ui, container } = view();
    expect(ui.getByText('файл my.liveappmap.json')).toBeTruthy();
    expect(ui.getByText(/^Карта открыта из файла: история/)).toBeTruthy();
    const left = picker(ui, 'left');
    expect(within(left).getByRole('option', { name: 'Файл на диске' }).hasAttribute('disabled')).toBe(true);
    await waitFor(() => expect(ui.getByTestId('compare-total').textContent).toBe('Версии совпадают: изменений нет.'));
    expect(ui.getAllByTestId('compare-summary').map((s) => s.textContent)).toEqual(ui.getAllByTestId('compare-summary').map(() => 'без изменений'));
    expect(net?.calls).toHaveLength(0);
    dumpDom('cmp-file', container);
  });

  test('карта каталога: «было» — последний коммит, разделы, переход к роуту', async () => {
    history();
    catalog();
    const { ui, container } = view();
    await waitFor(() => expect(picker(ui, 'left').value).toBe(`git:${VERSIONS[0]?.ref}`));
    expect(within(picker(ui, 'left')).getByRole('option', { name: '21.11 17:13 · a1b2c3d · скан после правки' })).toBeTruthy();
    await waitFor(() => expect(ui.getByTestId('compare-total').textContent).toMatch(/^Изменений: \d+$/));
    expect(net?.calls.map((c) => c.url)).toContain(`/__lam_maps/version?id=korbor-miniapp&ref=${VERSIONS[0]?.ref}`);
    dumpDom('cmp-git', container);
    const changed = ui.getAllByTestId('compare-summary').filter((s) => s.textContent !== 'без изменений');
    expect(changed.length).toBeGreaterThan(0);
    expect(first(changed).textContent).toMatch(/^[+−~]\d+/);
    const link = container.querySelector('.db-view__link');
    if (!(link instanceof HTMLElement)) {
      throw new Error('нет перехода');
    }
    fireEvent.click(link);
    expect(useViewStore.getState().view).not.toBe('compare');
  });

  test('длинный раздел: «Показать ещё» и «Свернуть»', async () => {
    history((url) => (url.startsWith('/__lam_maps/version?') ? jsonResponse(mapJson('live-app-map')) : undefined));
    catalog();
    const { ui } = view();
    await waitFor(() => expect(ui.getByTestId('compare-total').textContent).toMatch(/^Изменений/));
    const more = ui.queryAllByRole('button', { name: /^Показать ещё \d+$/ })[0];
    if (more === undefined) {
      throw new Error('нет длинного раздела');
    }
    const section = more.closest('section');
    if (section === null) {
      throw new Error('нет раздела');
    }
    expect(within(section).getAllByTestId('compare-item')).toHaveLength(40);
    fireEvent.click(more);
    expect(within(section).getAllByTestId('compare-item').length).toBeGreaterThan(40);
    fireEvent.click(within(section).getByRole('button', { name: 'Свернуть' }));
    expect(within(section).getAllByTestId('compare-item')).toHaveLength(40);
  });

  test('история недоступна — подсказка; «было» остаётся файлом на диске', async () => {
    history((url) => (url.startsWith('/__lam_maps/versions') ? jsonResponse({ error: 'не git-репозиторий' }, 500) : undefined));
    catalog();
    const { ui, container } = view();
    await waitFor(() => expect(ui.getByText('История карты недоступна: не git-репозиторий')).toBeTruthy());
    expect(picker(ui, 'left').value).toBe('disk');
    await waitFor(() => expect(ui.queryByTestId('compare-total')).not.toBeNull());
    dumpDom('cmp-disk', container);
  });

  test('свежий скан: «сканирую проект…», затем итог; «стало» не с открытой картой — без переходов', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    history((url) => (url.startsWith('/__lam_maps/scan') ? gate.then(() => jsonResponse(mapJson('korbor-site'))) : undefined));
    catalog();
    const { ui, container } = view();
    await waitFor(() => expect(ui.queryByTestId('compare-total')).not.toBeNull());
    fireEvent.change(picker(ui, 'right'), { target: { value: 'scan' } });
    expect(ui.getByTestId('compare-loading').textContent).toBe('Стало: сканирую проект…');
    dumpDom('cmp-scanning', container);
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(ui.queryByTestId('compare-loading')).toBeNull());
    expect(net?.calls.find((c) => c.url.startsWith('/__lam_maps/scan'))?.method).toBe('POST');
    expect(container.querySelector('.db-view__link')).toBeNull();
    fireEvent.change(picker(ui, 'right'), { target: { value: 'open' } });
    await waitFor(() => expect(picker(ui, 'right').value).toBe('open'));
  });

  test('выбор «было» до ответа истории не перезаписывается', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    history((url) => (url.startsWith('/__lam_maps/versions') ? gate.then(() => jsonResponse({ versions: VERSIONS })) : undefined));
    catalog();
    const { ui } = view();
    fireEvent.change(picker(ui, 'left'), { target: { value: 'open' } });
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(within(picker(ui, 'left')).queryAllByRole('option').length).toBe(6));
    expect(picker(ui, 'left').value).toBe('open');
    await waitFor(() => expect(ui.getByTestId('compare-total').textContent).toBe('Версии совпадают: изменений нет.'));
  });

  test('файл с компьютера: карта сравнивается, плохой файл — ошибка', async () => {
    history((url) => (url.startsWith('/__lam_maps/version?') ? jsonResponse({ error: 'нет такого коммита' }, 404) : undefined));
    catalog();
    const { ui, container } = view();
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('Было: нет такого коммита'));
    const input = ui.getByTestId('compare-left-file');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('нет поля файла');
    }
    fireEvent.change(picker(ui, 'left'), { target: { value: 'file' } });
    const user = userEvent.setup({ document });
    await user.upload(input, new File([JSON.stringify(mapJson('korbor-admin'))], 'admin.liveappmap.json', { type: 'application/json' }));
    await waitFor(() => expect(picker(ui, 'left').value).toBe('file-chosen'));
    expect(picker(ui, 'left').querySelector('option[value="file-chosen"]')?.textContent).toBe('Файл: admin.liveappmap.json');
    await waitFor(() => expect(ui.getByTestId('compare-total').textContent).toMatch(/^Изменений/));
    dumpDom('cmp-upload', container);
    await user.upload(input, new File(['не json'], 'bad.json', { type: 'application/json' }));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toMatch(/^Было: /));
    fireEvent.change(picker(ui, 'left'), { target: { value: 'disk' } });
    await waitFor(() => expect(net?.calls.some((c) => c.url === '/maps/korbor-miniapp.liveappmap.json')).toBe(true));
  });
});
