/**
 * Reassure: время и число рендеров ключевых экранов на настоящей карте korbor-miniapp
 * (314 роутов, 74 таблицы) — со сценарием поиска. Запуск — `bun run test:perf`.
 */
import { useDom, type Ui } from '../test/dom';
import { beforeEach, expect } from 'bun:test';
import { waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiView } from '../components/ApiView';
import { CommandPalette } from '../components/CommandPalette';
import { DatabaseView } from '../components/DatabaseView';
import { useUiStore } from '../store/ui-store';
import { openMap, resetStores } from '../test/fixtures';
import { perfTest, type PerfStats } from './perf-test';

useDom();

/** Каждый прогон Reassure — с чистыми сторами и открытой картой (фильтры живут в сторе). */
function freshMap(): void {
  resetStores();
  openMap('korbor-miniapp');
}

beforeEach(freshMap);

/** Запросы к отрисованному экрану (Reassure передаёт сценарию результат render). */
function uiOf(view: RenderResult): Ui {
  return within(view.container);
}

/** Ввод перерисовал экран, рендеры заняли время, лишних (с тем же деревом) нет. */
function rendered(stats: PerfStats): void {
  expect(stats.meanCount).toBeGreaterThan(1);
  expect(stats.meanDuration).toBeGreaterThan(0);
  expect(stats.issues.redundantUpdates).toEqual([]);
}

perfTest(
  'вид «API»: список всех роутов и поиск по пути',
  () => <ApiView />,
  {
    runs: 5,
    beforeEach: freshMap,
    scenario: async (view: RenderResult) => {
      const ui = uiOf(view);
      const all = ui.getAllByTestId('api-route-row').length;
      await userEvent.setup({ document }).type(ui.getByLabelText('Поиск роутов'), 'admin');
      await waitFor(() => expect(ui.getAllByTestId('api-route-row').length).toBeLessThan(all));
    },
  },
  rendered,
);

perfTest(
  'вид «База данных»: таблицы и поиск',
  () => <DatabaseView />,
  {
    runs: 5,
    beforeEach: freshMap,
    scenario: async (view: RenderResult) => {
      const ui = uiOf(view);
      const all = view.container.querySelectorAll('.db-view__row').length;
      await userEvent.setup({ document }).type(ui.getByLabelText('Поиск таблиц'), 'user');
      await waitFor(() => expect(view.container.querySelectorAll('.db-view__row').length).toBeLessThan(all));
    },
  },
  rendered,
);

perfTest(
  'глобальный поиск: ввод запроса по всей карте',
  () => <CommandPalette />,
  {
    runs: 5,
    beforeEach: () => {
      freshMap();
      useUiStore.setState({ palette: true });
    },
    scenario: async (view: RenderResult) => {
      const ui = uiOf(view);
      await userEvent.setup({ document }).type(ui.getByTestId('palette-input'), 'admin');
      await waitFor(() => expect(ui.getAllByTestId('palette-row').some((b) => b.getAttribute('data-kind') === 'route')).toBe(true));
    },
  },
  rendered,
);