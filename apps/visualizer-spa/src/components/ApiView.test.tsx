/**
 * Вид «API» как у пользователя: покрытие, домены, фильтры, список, доска роута.
 * Карта — настоящая korbor-miniapp (314 роутов korbor).
 */
import { dumpDom, useDom, type Ui } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildCodeIndex } from '@live-app-map/graph';
import { routeCard } from '../lib/api-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { openMap, openMapWithUndocumentedRoute, resetStores } from '../test/fixtures';
import { ApiView } from './ApiView';

useDom();

beforeEach(resetStores);

function view() {
  const r = render(<ApiView />);
  return { ui: within(r.container), container: r.container };
}

/** Раскрывает покрытие (свёрнуто по умолчанию). */
function openCoverage(ui: Ui): HTMLElement {
  fireEvent.click(within(ui.getByTestId('api-coverage-box')).getByRole('button'));
  return ui.getByTestId('api-coverage');
}

/** Строки покрытия, которые включают фильтр. */
function clickableCoverage(ui: Ui): HTMLElement[] {
  return [...openCoverage(ui).querySelectorAll<HTMLElement>('[title^="Нажмите"]')];
}

function rows(ui: Ui): string[] {
  return ui.queryAllByTestId('api-route-row').map((b) => b.getAttribute('data-route-id') ?? '');
}

describe('вид «API»', () => {
  test('карта без роутов: подсказка про --code-dir', () => {
    const { ui, container } = view();
    expect(ui.getByTestId('api-view').textContent).toBe('В карте нет роутов API. Сканируйте с исходниками: scan --code-dir <корень репо>.');
    dumpDom('api-empty', container);
  });

  test('покрытие, домены и список всех роутов', () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = doc.code?.routes.length ?? 0;
    const cov = within(openCoverage(ui)).getAllByRole('term').map((dt) => dt.textContent);
    expect(cov).toEqual(['Описания авторов', 'Описания из кода', 'Проверка входа', 'Доступ', 'Вызываются экранами']);
    expect(within(ui.getByTestId('api-coverage')).getAllByRole('definition').every((dd) => dd.textContent?.endsWith(`из ${total}`))).toBe(true);
    expect(rows(ui)).toHaveLength(total);
    expect(ui.getByText(`Выберите роут — ${total} в карте.`)).toBeTruthy();
    expect(ui.getByRole('button', { name: `Все роуты ${total}` })).toBeTruthy();
    dumpDom('api-all', container);
  });

  test('домены вместо сервисов и аудиторий; домен сужает список; «Все роуты» возвращает', () => {
    openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = rows(ui).length;
    const domains = ui.getAllByTestId('api-domain');
    const names = domains.map((d) => d.querySelector('span')?.textContent ?? '');
    expect(names).toEqual(expect.arrayContaining(['auth', 'vacancies', 'deals', 'candidates']));
    for (const audience of ['admin', 'employer', 'recruiter']) {
      expect(names).not.toContain(audience);
    }
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const count = (d: HTMLElement): number => Number(d.querySelectorAll('span')[1]?.textContent);
    expect(domains.reduce((n, d) => n + count(d), 0)).toBe(total);
    const vac = domains[names.indexOf('vacancies')];
    if (vac === undefined) {
      throw new Error('нет домена vacancies');
    }
    fireEvent.click(vac);
    expect(useViewStore.getState().apiScope).toBe('vacancies');
    expect(rows(ui).length).toBe(count(vac));
    expect(vac.getAttribute('aria-pressed')).toBe('true');
    const paths = rows(ui).map((id) => useAppStore.getState().document?.code?.routes.find((r) => r.id === id)?.path ?? '');
    expect(paths.every((p) => p.includes('/vacancies'))).toBe(true);
    expect(new Set(paths.map((p) => p.split('/')[3])).size).toBeGreaterThan(1);
    dumpDom('api-scope', container);
    fireEvent.click(ui.getByRole('button', { name: `Все роуты ${total}` }));
    expect(useViewStore.getState().apiScope).toBeNull();
  });

  test('фильтры: метод, поиск, таблица, без описания, без экранов, сброс', async () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = rows(ui).length;
    fireEvent.click(ui.getByTestId('api-method-GET'));
    const gets = rows(ui).length;
    expect(gets).toBe(doc.code?.routes.filter((r) => r.method === 'GET').length ?? -1);
    expect(ui.getByRole('button', { name: 'Сбросить (1)' })).toBeTruthy();
    fireEvent.click(ui.getByTestId('api-method-GET'));
    expect(rows(ui)).toHaveLength(total);
    fireEvent.click(ui.getByTestId('api-undocumented'));
    expect(useViewStore.getState().apiFilter.undocumented).toBe(true);
    fireEvent.click(ui.getByTestId('api-no-screens'));
    expect(useViewStore.getState().apiFilter.noScreens).toBe(true);
    const table = doc.code?.tables[0]?.name ?? '';
    const tableInput = ui.getByLabelText('Таблица');
    await userEvent.setup({ document }).type(tableInput, table);
    expect(useViewStore.getState().apiFilter.table).toBe(table);
    dumpDom('api-filtered', container);
    fireEvent.click(ui.getByRole('button', { name: 'Сбросить (3)' }));
    expect(useViewStore.getState().apiFilter).toEqual({});
    await userEvent.setup({ document }).type(ui.getByLabelText('Поиск роутов'), 'нет-такого-роута-zzz');
    expect(rows(ui)).toHaveLength(0);
    expect(ui.getByText('Ничего не найдено по «нет-такого-роута-zzz».')).toBeTruthy();
    dumpDom('api-nothing', container);
    fireEvent.click(ui.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(rows(ui)).toHaveLength(total);
  });

  test('строки покрытия «Описания авторов» и «Вызываются экранами» включают фильтры', () => {
    openMap('korbor-miniapp');
    const { ui } = view();
    const clickable = clickableCoverage(ui);
    expect(clickable).toHaveLength(2);
    clickable.forEach((row) => fireEvent.click(row));
    expect(useViewStore.getState().apiFilter).toEqual({ undocumented: true, noScreens: true });
    act(() => useViewStore.getState().setApiFilter({ methods: ['DELETE'] }));
    const first = ui.getByTestId('api-coverage').querySelector<HTMLElement>('[title^="Нажмите"]');
    if (first === null) {
      throw new Error('нет строки покрытия');
    }
    fireEvent.click(first);
    expect(useViewStore.getState().apiFilter).toEqual({ methods: ['DELETE'], undocumented: true });
  });

  test('пустой поиск без слов: «Ничего не найдено.»', () => {
    openMap('korbor-miniapp');
    act(() => useViewStore.getState().setApiFilter({ methods: ['ALL'], query: '' }));
    const { ui } = view();
    if (rows(ui).length === 0) {
      expect(ui.getByText('Ничего не найдено.')).toBeTruthy();
    }
  });

  test('выбор роута: доска; скрытый фильтром — «Показать все роуты»', () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const first = ui.getAllByTestId('api-route-row')[0];
    if (first === undefined) {
      throw new Error('нет роутов');
    }
    fireEvent.click(first);
    const id = first.getAttribute('data-route-id') ?? '';
    expect(useViewStore.getState().route).toBe(id);
    expect(first.getAttribute('aria-current')).toBe('true');
    const route = doc.code?.routes.find((r) => r.id === id);
    expect(within(ui.getByTestId('api-route-card')).getByText(route?.path ?? '-')).toBeTruthy();
    dumpDom('api-card-first', container);
    const other = doc.code?.routes.find((r) => r.method !== route?.method)?.method ?? 'POST';
    fireEvent.click(ui.getByTestId(`api-method-${other}`));
    expect(ui.getByTestId('api-hidden-selected')).toBeTruthy();
    fireEvent.click(ui.getByRole('button', { name: 'Показать все роуты' }));
    expect(ui.queryByTestId('api-hidden-selected')).toBeNull();
  });
});

describe('доска роута', () => {
  /** Роут, у которого карточка удовлетворяет условию. */
  function pick(cond: (c: NonNullable<ReturnType<typeof routeCard>>) => boolean): string {
    const doc = useAppStore.getState().document;
    if (doc === null) {
      throw new Error('нет карты');
    }
    const index = buildCodeIndex(doc);
    const hit = doc.code?.routes.find((r) => {
      const c = routeCard(index, r.id);
      return c !== null && cond(c);
    });
    if (hit === undefined) {
      throw new Error('в карте нет подходящего роута');
    }
    return hit.id;
  }

  test('вход с полями, доступ, таблицы с переходом', () => {
    openMap('korbor-miniapp');
    const id = pick((c) => c.inputs.some((i) => i.schema.fields.length > 0) && c.route.access !== undefined && c.reads.length + c.writes.length > 0);
    act(() => useViewStore.getState().openRoute(id));
    const { ui, container } = view();
    const card = within(ui.getByTestId('api-route-card'));
    expect(card.getAllByTestId('api-input').length).toBeGreaterThan(0);
    expect(card.getAllByTestId('api-input-field').length).toBeGreaterThan(0);
    expect(card.getByTestId('api-access').textContent).not.toContain('роут открыт');
    dumpDom('api-card-rich', container);
    const link = card.getAllByTestId('api-table-link')[0];
    if (link === undefined) {
      throw new Error('нет таблиц');
    }
    fireEvent.click(link);
    expect(useViewStore.getState().view).toBe('database');
  });

  test('роут без доступа, без входа, без таблиц', () => {
    openMap('korbor-miniapp');
    const id = pick((c) => c.route.access === undefined && c.inputs.length === 0 && c.reads.length + c.writes.length === 0);
    act(() => useViewStore.getState().openRoute(id));
    const { ui, container } = view();
    const card = within(ui.getByTestId('api-route-card'));
    expect(card.getByText('Схемы входа в коде не найдено.')).toBeTruthy();
    expect(card.getByText('Проверок доступа в коде не найдено — роут открыт.')).toBeTruthy();
    expect(card.getByText('Запросов в БД не найдено.')).toBeTruthy();
    dumpDom('api-card-bare', container);
  });

  test('экраны: переход к экрану; нет экранов — почему', () => {
    openMap('korbor-miniapp');
    const called = pick((c) => c.callers.some((x) => x.nodeId !== undefined));
    act(() => useViewStore.getState().openRoute(called));
    const { ui } = view();
    const link = within(ui.getByTestId('api-route-card')).getAllByTestId('api-screen-link').find((b) => !b.hasAttribute('disabled'));
    if (link === undefined) {
      throw new Error('нет экранов');
    }
    fireEvent.click(link);
    expect(useViewStore.getState().view).toBe('screens');
    expect(useAppStore.getState().selectedPageId).not.toBeNull();
    act(() => useViewStore.getState().openRoute(pick((c) => c.gap !== undefined)));
    expect(ui.getByTestId('api-screen-gap').textContent).toContain('Экраны карты не вызывают:');
  });

  test('длинное описание: первый абзац и «Полностью»', () => {
    openMap('korbor-miniapp');
    const id = pick((c) => c.summary !== undefined && /\n\s*\n/.test(c.summary));
    act(() => useViewStore.getState().openRoute(id));
    const { ui, container } = view();
    const doc = () => ui.getByTestId('api-route-card').querySelector('[data-testid="api-summary"]')?.textContent ?? '';
    const before = doc();
    dumpDom('api-card-summary', container);
    fireEvent.click(ui.getByRole('button', { name: 'Полностью' }));
    expect(doc().length).toBeGreaterThan(before.length);
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
  });

  test('без авторского описания: подсказка с файлом обработчика', () => {
    const id = openMapWithUndocumentedRoute('korbor-miniapp');
    act(() => useViewStore.getState().openRoute(id));
    const { ui } = view();
    expect(within(ui.getByTestId('api-route-card')).getByText(/^Авторского описания нет — добавьте комментарий над обработчиком/)).toBeTruthy();
  });
});

describe('вид «API» без шума (аудит)', () => {
  test('покрытие свёрнуто в одну строку и раскрывается', () => {
    const doc = openMap('korbor-miniapp');
    const { ui } = view();
    const total = doc.code?.routes.length ?? 0;
    const trigger = within(ui.getByTestId('api-coverage-box')).getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(ui.queryByTestId('api-coverage')).toBeNull();
    expect(trigger.textContent).toMatch(new RegExp(`^Покрытие: описано \\d+ из ${total} · вызываются экранами \\d+ из ${total}$`));
  });

  test('ключ и замок — только у роутов, которые отличаются от большинства', () => {
    const doc = openMap('korbor-miniapp');
    const routes = doc.code?.routes ?? [];
    const inputUsual = routes.filter((r) => r.input !== undefined).length * 2 >= routes.length;
    const accessUsual = routes.filter((r) => r.access !== undefined).length * 2 >= routes.length;
    const deviating = routes.filter((r) => (r.input !== undefined) !== inputUsual || (r.access !== undefined) !== accessUsual).map((r) => r.id).sort();
    const { ui } = view();
    const marked = ui.getAllByTestId('api-route-row').filter((b) => b.querySelector('[data-testid="api-mark"] svg') !== null).map((b) => b.getAttribute('data-route-id') ?? '').sort();
    expect(marked).toEqual(deviating);
    expect(marked.length).toBeLessThan(routes.length / 2);
    const labels = new Set(ui.getAllByTestId('api-route-row').flatMap((b) => [...b.querySelectorAll('[data-testid="api-mark"] svg')].map((s) => s.getAttribute('aria-label'))));
    for (const l of labels) {
      expect(['вход проверяется', 'вход не проверяется', 'доступ проверяется', 'доступ не проверяется']).toContain(l ?? '');
    }
  });

  test('группы списка — те же домены, что слева, без имён сервисов', () => {
    const doc = openMap('korbor-miniapp');
    const { ui } = view();
    const groups = ui.getAllByTestId('api-domain-group').map((g) => g.querySelector('h3')?.firstChild?.textContent?.trim() ?? '');
    const domains = ui.getAllByTestId('api-domain').map((d) => d.querySelector('span')?.textContent ?? '');
    expect(groups).toEqual(domains);
    const serviceNames = (doc.code?.services ?? []).map((s) => s.name);
    expect(groups.some((g) => serviceNames.includes(g))).toBe(false);
  });
});
