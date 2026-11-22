/**
 * Вид «API» как у пользователя: покрытие, дерево разделов, фильтры, список, карточка роута.
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
import { openMap, resetStores } from '../test/fixtures';
import { ApiView } from './ApiView';

useDom();

beforeEach(resetStores);

function view() {
  const r = render(<ApiView />);
  return { ui: within(r.container), container: r.container };
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

  test('покрытие, дерево и список всех роутов', () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = doc.code?.routes.length ?? 0;
    const cov = within(ui.getByTestId('api-coverage')).getAllByRole('term').map((dt) => dt.textContent);
    expect(cov).toEqual(['Описания авторов', 'Описания из кода', 'Проверка входа', 'Доступ', 'Вызываются экранами']);
    expect(within(ui.getByTestId('api-coverage')).getAllByRole('definition').every((dd) => dd.textContent?.endsWith(`из ${total}`))).toBe(true);
    expect(rows(ui)).toHaveLength(total);
    expect(ui.getByText(`Выберите роут — ${total} в карте.`)).toBeTruthy();
    expect(ui.getByRole('button', { name: `Все роуты ${total}` })).toBeTruthy();
    dumpDom('api-all', container);
  });

  test('раздел дерева сужает список и раскрывает модули; «Все роуты» возвращает', () => {
    openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = rows(ui).length;
    const sections = ui.getAllByTestId('api-section');
    const big = sections.find((s) => Number(s.querySelector('.api-count')?.textContent) > 1) ?? sections[0];
    if (big === undefined) {
      throw new Error('нет разделов');
    }
    fireEvent.click(big);
    expect(useViewStore.getState().apiScope).toBe(big.getAttribute('title'));
    expect(rows(ui).length).toBe(Number(big.querySelector('.api-count')?.textContent));
    expect(big.className).toContain('api-tree__row--on');
    dumpDom('api-scope', container);
    const modules = container.querySelectorAll('.api-tree__row--module');
    const mod = modules[0];
    if (mod instanceof HTMLElement) {
      fireEvent.click(mod);
      expect(useViewStore.getState().apiScope).toBe(mod.getAttribute('title'));
      expect(rows(ui).length).toBe(Number(mod.querySelector('.api-count')?.textContent));
    }
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
    const { container } = view();
    const clickable = container.querySelectorAll('.api-coverage__row--click');
    expect(clickable).toHaveLength(2);
    clickable.forEach((row) => fireEvent.click(row));
    expect(useViewStore.getState().apiFilter).toEqual({ undocumented: true, noScreens: true });
    act(() => useViewStore.getState().setApiFilter({ methods: ['DELETE'] }));
    fireEvent.click(container.querySelectorAll('.api-coverage__row--click')[0] ?? container);
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

  test('выбор роута: карточка; скрытый фильтром — «Показать все роуты»', () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const first = ui.getAllByTestId('api-route-row')[0];
    if (first === undefined) {
      throw new Error('нет роутов');
    }
    fireEvent.click(first);
    const id = first.getAttribute('data-route-id') ?? '';
    expect(useViewStore.getState().route).toBe(id);
    expect(first.className).toContain('api-row--on');
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

describe('карточка роута', () => {
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
    const doc = () => ui.getByTestId('api-route-card').querySelector('.api-card__doc')?.textContent ?? '';
    const before = doc();
    dumpDom('api-card-summary', container);
    fireEvent.click(ui.getByRole('button', { name: 'Полностью' }));
    expect(doc().length).toBeGreaterThan(before.length);
    expect(ui.queryByRole('button', { name: 'Полностью' })).toBeNull();
  });

  test('без авторского описания: подсказка с файлом обработчика', () => {
    openMap('korbor-miniapp');
    const id = pick((c) => c.summary === undefined);
    act(() => useViewStore.getState().openRoute(id));
    const { ui } = view();
    expect(within(ui.getByTestId('api-route-card')).getByText(/^Авторского описания нет — добавьте комментарий над обработчиком/)).toBeTruthy();
  });
});
