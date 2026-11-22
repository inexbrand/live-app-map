/**
 * Вид «База данных» как у пользователя: список таблиц с поиском, колонки, ссылки, роуты и экраны.
 * Карта — настоящая korbor-miniapp (74 таблицы korbor).
 */
import { dumpDom, useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dbIndexOf, tableView } from '../lib/db-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { openMap, resetStores } from '../test/fixtures';
import { DatabaseView } from './DatabaseView';

useDom();

beforeEach(resetStores);

function view() {
  const r = render(<DatabaseView />);
  return { ui: within(r.container), container: r.container };
}

type Pick = NonNullable<ReturnType<typeof tableView>>;

/** Таблица карты, вид которой удовлетворяет условию. */
function pickTable(cond: (v: Pick) => boolean): Pick {
  const index = dbIndexOf(useAppStore.getState().document);
  const tables = useAppStore.getState().document?.code?.tables ?? [];
  for (const t of tables) {
    const v = index === null ? null : tableView(index, t.exportName);
    if (v !== null && cond(v)) {
      return v;
    }
  }
  throw new Error('нет подходящей таблицы');
}

describe('вид «База данных»', () => {
  test('без схемы: подсказка про --code-dir', () => {
    const { ui, container } = view();
    expect(ui.getByTestId('database-view').textContent).toContain('В карте нет схемы базы данных');
    dumpDom('db-empty', container);
  });

  test('список таблиц, первая открыта; поиск сужает список', async () => {
    const doc = openMap('korbor-miniapp');
    const { ui, container } = view();
    const total = doc.code?.tables.length ?? 0;
    expect(ui.getByText('Таблицы').querySelector('.db-view__count')?.textContent).toBe(String(total));
    expect(container.querySelectorAll('.db-view__row')).toHaveLength(total);
    expect(container.querySelector('.db-view__row--on')).not.toBeNull();
    expect(ui.getByTestId('db-table')).toBeTruthy();
    dumpDom('db-first', container);
    await userEvent.setup().type(ui.getByLabelText('Поиск таблиц'), 'нет-такой-таблицы-zzz');
    expect(container.querySelectorAll('.db-view__row')).toHaveLength(0);
    expect(ui.queryByTestId('db-table')).toBeNull();
  });

  test('таблица со ссылками: переход по ссылке колонки и по «ссылаются»', () => {
    openMap('korbor-miniapp');
    const v = pickTable((x) => x.table.columns.some((c) => c.references !== undefined) && x.referencedBy.length > 0);
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const { ui, container } = view();
    expect(within(ui.getByTestId('db-table')).getByRole('heading', { level: 2 }).textContent).toBe(v.table.name);
    dumpDom('db-refs', container);
    const refBtn = Array.from(container.querySelectorAll('.db-view__columns .db-view__link'))[0];
    if (!(refBtn instanceof HTMLElement)) {
      throw new Error('нет ссылки колонки');
    }
    fireEvent.click(refBtn);
    expect(useViewStore.getState().table).not.toBe(v.table.exportName);
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const first = v.referencedBy[0];
    fireEvent.click(ui.getByRole('button', { name: `${first?.table}.${first?.column}` }));
    expect(useViewStore.getState().table).toBe(first?.table ?? '');
  });

  test('таблица без ссылок и без роутов', () => {
    openMap('korbor-miniapp');
    const v = pickTable((x) => x.referencedBy.length === 0 && x.readRoutes.length === 0 && x.writeRoutes.length === 0);
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const { ui, container } = view();
    expect(ui.getByText('Другие таблицы на неё не ссылаются.')).toBeTruthy();
    expect(ui.getByText('Ни один роут не читает эту таблицу.')).toBeTruthy();
    expect(ui.getByText('Ни один роут не пишет эту таблицу.')).toBeTruthy();
    dumpDom('db-bare', container);
  });

  test('роуты таблицы: больше восьми — «Показать ещё», переход в «API» и к экрану', () => {
    openMap('korbor-miniapp');
    const v = pickTable((x) => x.readRoutes.length > 8 && x.readRoutes.some((u) => u.screens.some((s) => s.nodeId !== undefined)));
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const { ui, container } = view();
    const reads = () => within(ui.getByText('Читают').closest('section') ?? container);
    expect(reads().getAllByTestId('db-route-link')).toHaveLength(8);
    fireEvent.click(reads().getByRole('button', { name: `Показать ещё ${v.readRoutes.length - 8}` }));
    expect(reads().getAllByTestId('db-route-link')).toHaveLength(v.readRoutes.length);
    dumpDom('db-routes-all', container);
    fireEvent.click(reads().getByRole('button', { name: 'Свернуть' }));
    expect(reads().getAllByTestId('db-route-link')).toHaveLength(8);
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const screen = reads().queryAllByRole('button').find((b) => b.className === 'ui-chip' && !b.hasAttribute('disabled'));
    if (screen !== undefined) {
      fireEvent.click(screen);
      expect(useViewStore.getState().view).toBe('screens');
      expect(useAppStore.getState().selectedPageId).not.toBeNull();
    }
    act(() => useViewStore.getState().openTable(v.table.exportName));
    const link = reads().getAllByTestId('db-route-link')[0];
    if (link === undefined) {
      throw new Error('нет роута');
    }
    fireEvent.click(link);
    expect(useViewStore.getState().view).toBe('api');
  });

  test('длинное описание таблицы сворачивается', () => {
    openMap('korbor-miniapp');
    const long = (useAppStore.getState().document?.code?.tables ?? []).find((t) => (t.doc?.length ?? 0) > 360);
    if (long === undefined) {
      return;
    }
    act(() => useViewStore.getState().openTable(long.exportName));
    const { ui, container } = view();
    expect(container.querySelector('.db-view__doc--clamp')).not.toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Показать полностью' }));
    expect(container.querySelector('.db-view__doc--clamp')).toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Свернуть' }));
    expect(container.querySelector('.db-view__doc--clamp')).not.toBeNull();
  });
});
