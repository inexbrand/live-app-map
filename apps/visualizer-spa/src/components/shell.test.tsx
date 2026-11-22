/**
 * Оболочка как у пользователя: горячие клавиши (⌘K, /, ?, T, 1–4, G, Esc) и
 * глобальный поиск — стрелки, Enter, клик, действия, переходы к экрану, роуту,
 * таблице, документу и файлу кода.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHotkeys } from '../lib/use-hotkeys';
import { useOpenTarget } from '../lib/use-open-target';
import { useAppStore } from '../store/app-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useUiStore } from '../store/ui-store';
import { useViewStore } from '../store/view-store';
import { openMap, resetStores } from '../test/fixtures';
import { CommandPalette } from './CommandPalette';

useDom();

beforeEach(() => {
  resetStores();
  document.documentElement.dataset['theme'] = 'dark';
});

function Shell({ enabled }: { readonly enabled: boolean }) {
  useHotkeys(enabled);
  return (
    <div>
      <input aria-label="поле" />
      <CommandPalette />
    </div>
  );
}

function key(k: string, opts: KeyboardEventInit = {}, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

const ui = () => useUiStore.getState();
const view = () => useViewStore.getState();

describe('горячие клавиши', () => {
  test('⌘K и Ctrl+K открывают и закрывают поиск, Esc закрывает поиск и справку', () => {
    render(<Shell enabled={true} />);
    key('k', { metaKey: true });
    expect(ui().palette).toBe(true);
    key('K', { ctrlKey: true });
    expect(ui().palette).toBe(false);
    key('?');
    expect(ui().help).toBe(true);
    key('Escape');
    expect(ui().help).toBe(false);
    key('Escape');
    expect(ui().palette).toBe(false);
  });

  test('без карты: тема и справка работают, виды и поиск по / — нет', () => {
    render(<Shell enabled={false} />);
    key('t');
    expect(document.documentElement.dataset['theme']).toBe('light');
    key('Е');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    key('/');
    key('2');
    expect(ui().palette).toBe(false);
    expect(view().view).toBe('screens');
  });

  test('с картой: 1–4 — виды, G — граф документации и обратно, / — поиск', () => {
    openMap('korbor-miniapp');
    render(<Shell enabled={true} />);
    key('2');
    expect(view().view).toBe('api');
    key('3');
    expect(view().view).toBe('database');
    key('4');
    key('g');
    expect(view().docsMode).toBe('graph');
    key('п');
    expect(view().docsMode).toBe('text');
    key('9');
    key('x');
    key('/');
    expect(ui().palette).toBe(true);
  });

  test('в поле ввода и с модификаторами буквы не перехватываются', () => {
    openMap('korbor-miniapp');
    const r = render(<Shell enabled={true} />);
    const field = within(r.container).getByLabelText('поле');
    key('2', {}, field);
    key('2', { altKey: true });
    key('t', { metaKey: true });
    expect(view().view).toBe('screens');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('глобальный поиск', () => {
  test('без карты — подсказка открыть карту и действия', async () => {
    const r = render(<Shell enabled={false} />);
    act(() => ui().setPalette(true));
    const box = within(r.container);
    expect(box.getByTestId('palette-input').getAttribute('placeholder')).toBe('Сначала откройте карту');
    expect(box.getAllByTestId('palette-row').every((b) => b.getAttribute('data-kind') === 'action')).toBe(true);
    fireEvent.mouseDown(r.container.querySelector('.palette-backdrop') ?? document.body);
    expect(ui().palette).toBe(false);
  });

  test('запрос — группы результатов; стрелки и Enter открывают экран на холсте', async () => {
    const doc = openMap('korbor-miniapp');
    const screen = doc.nodes.find((n) => n.kind === 'page');
    const r = render(<Shell enabled={true} />);
    act(() => ui().setPalette(true));
    const user = userEvent.setup({ document });
    const box = within(r.container);
    await user.type(box.getByTestId('palette-input'), screen?.title ?? '');
    const rows = box.getAllByTestId('palette-row');
    expect(rows[0]?.getAttribute('data-kind')).toBe('screen');
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(box.getByTestId('palette-input'), { key: 'ArrowDown' });
    fireEvent.keyDown(box.getByTestId('palette-input'), { key: 'ArrowUp' });
    fireEvent.keyDown(box.getByTestId('palette-input'), { key: 'ArrowUp' });
    fireEvent.keyDown(box.getByTestId('palette-input'), { key: 'Enter' });
    expect(ui().palette).toBe(false);
    expect(view().view).toBe('screens');
    expect(useAppStore.getState().selectedPageId).toBe(screen?.id ?? null);
  });

  test('ничего не нашлось — подсказка и действие «фильтр холста»', async () => {
    openMap('korbor-miniapp');
    const r = render(<Shell enabled={true} />);
    act(() => ui().setPalette(true));
    const user = userEvent.setup({ document });
    const box = within(r.container);
    await user.type(box.getByTestId('palette-input'), 'zzzqqq');
    expect(box.getByText(/Ничего не нашлось/)).toBeTruthy();
    await user.click(box.getByText('Оставить на холсте экраны «zzzqqq»'));
    expect(useAppStore.getState().searchQuery).toBe('zzzqqq');
    act(() => ui().setPalette(true));
    await user.click(within(r.container).getByText('Показать все экраны'));
    expect(useAppStore.getState().searchQuery).toBe('');
  });

  test('действия: виды, граф, незакрытые эпохи, тема, справка; Esc закрывает', async () => {
    openMap('korbor-miniapp');
    const r = render(<Shell enabled={true} />);
    const user = userEvent.setup({ document });
    const pick = async (title: string): Promise<void> => {
      act(() => ui().setPalette(true));
      const row = within(r.container).getByText(title);
      fireEvent.mouseMove(row);
      await user.click(row);
    };
    await pick('API');
    expect(view().view).toBe('api');
    await pick('База данных');
    expect(view().view).toBe('database');
    await pick('Документация');
    expect(view().view).toBe('docs');
    await pick('Граф документации');
    expect(view().docsMode).toBe('graph');
    await pick('Незакрытые эпохи на графе');
    expect(useDocGraphStore.getState().readiness).toBe('not-ready');
    await pick('Экраны');
    expect(view().view).toBe('screens');
    await pick('Сменить тему');
    expect(document.documentElement.dataset['theme']).toBe('light');
    await pick('Горячие клавиши');
    expect(ui().help).toBe(true);
    act(() => ui().setPalette(true));
    fireEvent.keyDown(within(r.container).getByTestId('palette-input'), { key: 'Escape' });
    expect(ui().palette).toBe(false);
  });

  test('переходы: роут — в «API», таблица — в «Базу», документ — в текст, файл — к его роуту, таблице или экрану', async () => {
    const doc = openMap('korbor-miniapp');
    const code = doc.code;
    const route = code?.routes[0];
    const table = code?.tables[0];
    const tableOnly = code?.tables.find((t) => !code.routes.some((r) => r.location.file === t.location.file));
    const epochFile = doc.docs?.epochs[0]?.files[0];
    const r = render(<Shell enabled={true} />);
    const user = userEvent.setup({ document });
    const open = async (q: string, kind: string): Promise<void> => {
      act(() => ui().setPalette(true));
      const box = within(r.container);
      await user.clear(box.getByTestId('palette-input'));
      await user.type(box.getByTestId('palette-input'), q);
      const row = box.getAllByTestId('palette-row').find((b) => b.getAttribute('data-kind') === kind);
      if (row === undefined) {
        throw new Error(`нет строки ${kind} для «${q}»`);
      }
      await user.click(row);
    };
    if (route !== undefined) {
      await open(`${route.method} ${route.path}`, 'route');
      expect([view().view, view().route]).toEqual(['api', route.id]);
      await open(route.location.file, 'file');
      expect(view().apiFilter).toEqual({ query: route.location.file });
    }
    if (table !== undefined) {
      await open(table.name, 'table');
      expect([view().view, view().table]).toEqual(['database', table.exportName]);
    }
    if (tableOnly !== undefined) {
      await open(tableOnly.location.file, 'file');
      expect(view().table).toBe(tableOnly.exportName);
    }
    if (epochFile !== undefined) {
      await open(epochFile.title, 'doc');
      expect(view().view).toBe('docs');
    }
    expect([route, table, tableOnly, epochFile].map((x) => x !== undefined)).toEqual([true, true, true, true]);
  });

  test('файл экрана (не роут и не таблица) — экран на холсте; неизвестный файл — ничего', () => {
    const doc = openMap('korbor-miniapp');
    const screen = doc.nodes.find((n) => n.kind === 'page' && n.source?.file !== undefined);
    let go: ReturnType<typeof useOpenTarget> = () => undefined;
    function Probe() {
      go = useOpenTarget();
      return null;
    }
    render(<Probe />);
    act(() => view().setView('api'));
    act(() => go({ kind: 'file', file: 'нет/такого.ts' }));
    expect(view().view).toBe('api');
    act(() => go({ kind: 'file', file: screen?.source?.file ?? '' }));
    expect(view().view).toBe('screens');
    expect(useAppStore.getState().selectedPageId).not.toBeNull();
  });
});
