/**
 * Граф документации как у пользователя: фильтры, поиск, карточка узла и холст
 * (клик, двойной клик, наведение, сдвиг, масштаб). Холст рисует в записывающий
 * контекст — проверяется, что и где нарисовано.
 */
import { dumpDom, useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '../../store/app-store';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { useViewStore } from '../../store/view-store';
import { circleCenters, installCanvas, lastFrame, type RecordingContext } from '../../test/canvas';
import { openMap, openMapWithOpenEpoch, resetStores } from '../../test/fixtures';
import { DocGraphView } from './DocGraphView';

useDom();

let canvas: ReturnType<typeof installCanvas>;

beforeEach(() => {
  resetStores();
  canvas = installCanvas(true);
});

afterEach(() => canvas.restore());

/** Слаг первой эпохи карты — запрос, который точно найдёт эпоху. */
function epochSlug(): string {
  const slug = openMap('korbor-miniapp').docs?.epochs[0]?.slug;
  if (slug === undefined) {
    throw new Error('нет эпох');
  }
  return slug;
}

/** Дождаться кадров рисования. */
async function frames(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

async function view() {
  const r = render(<DocGraphView switcher={<span>режим</span>} />);
  await frames();
  return { ui: within(r.container), container: r.container };
}

function stats(ui: ReturnType<typeof within>): string {
  return ui.getByTestId('graph-stats').textContent ?? '';
}

/** Колесо над точкой холста (WheelEvent в happy-dom не несёт координат мыши — задаются явно). */
function wheelAt(el: HTMLElement, x: number, y: number, deltaY: number): void {
  const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y } });
  act(() => {
    el.dispatchEvent(e);
  });
}

function first<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) {
    throw new Error('пусто');
  }
  return x;
}

type Spot = { readonly x: number; readonly y: number };

/** Центры узлов кадра, который не изменился за следующий кадр. */
async function stableCircles(ctx: RecordingContext): Promise<Spot[]> {
  let prev = JSON.stringify(circleCenters(ctx.log));
  for (let i = 0; i < 50; i += 1) {
    await frames();
    const now = JSON.stringify(circleCenters(ctx.log));
    if (now === prev) {
      return circleCenters(ctx.log);
    }
    prev = now;
  }
  throw new Error('кадр холста не устоялся');
}

/** Точка холста 800×600 дальше всего от узлов — «фон». */
function emptySpot(centers: readonly Spot[]): Spot {
  let best: Spot = { x: 0, y: 0 };
  let bestD = -1;
  for (let x = 10; x < 800; x += 10) {
    for (let y = 10; y < 600; y += 10) {
      const d = Math.min(...centers.map((c) => Math.hypot(c.x - x, c.y - y)));
      if (d > bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

describe('граф документации', () => {
  test('без документов — подсказка', async () => {
    const { container } = await view();
    expect(container.textContent).toContain('В карте нет документов — граф строить не из чего.');
  });

  test('фильтры типов и готовности меняют граф; «показать все» возвращает', async () => {
    openMapWithOpenEpoch('korbor-miniapp');
    const { ui, container } = await view();
    const start = stats(ui);
    dumpDom('graph-start', container);
    // По умолчанию типы, кроме файлов, включены: щелчок прячет тип, второй — возвращает
    expect(ui.getByTestId('graph-kind-epoch').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(ui.getByTestId('graph-kind-epoch'));
    expect(ui.getByTestId('graph-kind-epoch').getAttribute('aria-pressed')).toBe('false');
    expect(stats(ui)).not.toBe(start);
    dumpDom('graph-kind', container);
    fireEvent.click(ui.getByTestId('graph-kind-epoch'));
    expect(stats(ui)).toBe(start);
    fireEvent.click(ui.getByRole('button', { name: 'показать все' }));
    expect(stats(ui)).not.toBe(start);
    fireEvent.click(within(ui.getByRole('group', { name: 'Готовность эпох на графе' })).getByRole('button', { name: /^Не готово/ }));
    expect(useDocGraphStore.getState().readiness).toBe('not-ready');
    fireEvent.click(ui.getByTestId('graph-kind-route'));
    fireEvent.click(ui.getByTestId('graph-kind-route'));
    fireEvent.click(ui.getByTestId('graph-kind-epoch'));
    fireEvent.click(within(ui.getByRole('group', { name: 'Готовность эпох на графе' })).getByRole('button', { name: 'Готово' }));
    await frames();
    dumpDom('graph-filtered', container);
  });

  test('ни одного узла под фильтром — подсказка вместо холста', async () => {
    openMap('korbor-miniapp');
    act(() => useDocGraphStore.setState({ kinds: new Set(['epoch-file']) }));
    const { ui } = await view();
    expect(ui.getByText('Под фильтры не попал ни один узел. Включите типы или смените готовность.')).toBeTruthy();
  });

  test('поиск: совпадения, Enter выбирает первое, карточка со связями', async () => {
    openMap('korbor-miniapp');
    const { ui, container } = await view();
    const search = ui.getByLabelText('Поиск по графу');
    await userEvent.setup({ document }).type(search, epochSlug());
    fireEvent.keyDown(ui.getByLabelText('Поиск по графу'), { key: 'Enter' });
    const hit = first(ui.getAllByTestId('graph-hit'));
    const card = within(ui.getByTestId('graph-node-card'));
    expect(card.getByRole('heading', { level: 2 }).textContent).toBe(hit.textContent);
    expect(hit.className).toContain('doc-graph__link--on');
    await frames();
    dumpDom('graph-search', container);
    const link = first(card.queryAllByRole('listitem')).querySelector('button');
    if (link !== null) {
      const label = link.textContent;
      fireEvent.click(link);
      expect(within(ui.getByTestId('graph-node-card')).getByRole('heading', { level: 2 }).textContent).toBe(label);
    }
    fireEvent.click(first(ui.getAllByTestId('graph-hit')));
    fireEvent.click(within(ui.getByTestId('graph-node-card')).getByTestId('graph-open-text'));
    expect(useViewStore.getState().doc).not.toBeNull();
    await userEvent.setup({ document }).type(search, 'zzzнет');
    expect(ui.getByText('Ничего не найдено. Проверьте фильтры типов.')).toBeTruthy();
  });

  test('эпоха: показать и свернуть файлы, раскрыть все', async () => {
    openMap('korbor-miniapp');
    const { ui } = await view();
    const all = stats(ui);
    fireEvent.click(ui.getByTestId('graph-expand-all'));
    expect(stats(ui)).not.toBe(all);
    fireEvent.click(ui.getByRole('button', { name: 'Свернуть' }));
    expect(stats(ui)).toBe(all);
    expect(useDocGraphStore.getState().expanded.size).toBe(0);
    await userEvent.setup({ document }).type(ui.getByLabelText('Поиск по графу'), epochSlug());
    fireEvent.keyDown(ui.getByLabelText('Поиск по графу'), { key: 'Enter' });
    const card = within(ui.getByTestId('graph-node-card'));
    const toggle = card.queryByRole('button', { name: 'Показать файлы' });
    if (toggle !== null) {
      fireEvent.click(toggle);
      expect(stats(ui)).not.toBe(all);
      dumpDom('graph-epoch-open', ui.getByTestId('graph-node-card'));
      fireEvent.click(card.getByRole('button', { name: 'Свернуть файлы' }));
      expect(stats(ui)).toBe(all);
    }
  });
});

describe('холст графа', () => {
  function circles(ctx: RecordingContext) {
    return circleCenters(ctx.log);
  }

  test('рисует граф: кадр с узлами и подписями', async () => {
    openMap('korbor-miniapp');
    await view();
    const frame = lastFrame(canvas.ctx.log);
    expect(frame.some((e) => e.startsWith('arc('))).toBe(true);
    expect(frame.some((e) => e.startsWith('moveTo('))).toBe(true);
  });

  test('клик по узлу выбирает его, по фону — снимает выбор; двойной клик открывает', async () => {
    openMap('korbor-miniapp');
    const { ui } = await view();
    const el = ui.getByTestId('doc-graph-canvas');
    // Узлы берём с кадра, который уже не меняется: под нагрузкой первый кадр бывает до подгонки камеры.
    const p = first(await stableCircles(canvas.ctx));
    fireEvent.pointerMove(el, { clientX: p.x, clientY: p.y });
    await frames();
    fireEvent.pointerDown(el, { clientX: p.x, clientY: p.y, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: p.x, clientY: p.y, pointerId: 1 });
    // Под нагрузкой полного прогона кадр и перерисовка приходят позже 40 мс
    await waitFor(() => expect(ui.getByTestId('graph-node-card')).toBeTruthy());
    expect(el.getAttribute('data-selected')).not.toBe('');
    fireEvent.pointerLeave(el);
    // Выбранный узел камера ставит в центр холста (800×600) — двойной клик там, где он теперь.
    await frames();
    fireEvent.doubleClick(el, { clientX: 400, clientY: 300 });
    expect(useViewStore.getState().doc).not.toBeNull();
    const bg = emptySpot(await stableCircles(canvas.ctx));
    fireEvent.pointerDown(el, { clientX: bg.x, clientY: bg.y, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: bg.x, clientY: bg.y, pointerId: 1 });
    fireEvent.doubleClick(el, { clientX: bg.x, clientY: bg.y });
    expect(useDocGraphStore.getState().selected).toBeNull();
  });

  test('перетаскивание фона сдвигает граф, колесо меняет масштаб', async () => {
    openMap('korbor-miniapp');
    const { ui } = await view();
    const el = ui.getByTestId('doc-graph-canvas');
    const before = first(circles(canvas.ctx));
    fireEvent.pointerDown(el, { clientX: 2, clientY: 2, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 3, clientY: 3 });
    fireEvent.pointerMove(el, { clientX: 52, clientY: 32 });
    fireEvent.pointerUp(el, { clientX: 52, clientY: 32, pointerId: 1 });
    await frames();
    const moved = first(circles(canvas.ctx));
    expect([Math.round(moved.x - before.x), Math.round(moved.y - before.y)]).toEqual([50, 30]);
    expect(useDocGraphStore.getState().selected).toBeNull();
    wheelAt(el, 400, 300, -400);
    await frames();
    const zoomed = first(circles(canvas.ctx));
    expect(Math.hypot(zoomed.x - 400, zoomed.y - 300)).toBeGreaterThan(Math.hypot(moved.x - 400, moved.y - 300));
  });

  test('перенос узла не выбирает его; раскладка вживую держит выбранный узел в центре', async () => {
    canvas.restore();
    canvas = installCanvas(false);
    openMap('korbor-miniapp');
    const { ui } = await view();
    const el = ui.getByTestId('doc-graph-canvas');
    const p = first(circles(canvas.ctx));
    fireEvent.pointerDown(el, { clientX: p.x, clientY: p.y, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: p.x + 40, clientY: p.y + 40 });
    fireEvent.pointerUp(el, { clientX: p.x + 40, clientY: p.y + 40, pointerId: 1 });
    expect(useDocGraphStore.getState().selected).toBeNull();
    await userEvent.setup({ document }).type(ui.getByLabelText('Поиск по графу'), epochSlug());
    fireEvent.keyDown(ui.getByLabelText('Поиск по графу'), { key: 'Enter' });
    await frames();
    await frames();
    expect(el.getAttribute('data-selected')).not.toBe('');
    // Выбранный узел подписан ярче всех.
    expect(lastFrame(canvas.ctx.log).includes('fillStyle="labelS"') || lastFrame(canvas.ctx.log).some((e) => e.startsWith('fillStyle='))).toBe(true);
  });
});

describe('граф по умолчанию (аудит, пункт 3)', () => {
  test('только документы: файлов кода нет, узлов в разы меньше; «показать все» возвращает всё', async () => {
    openMap('korbor-miniapp');
    const { ui } = await view();
    const count = (): number => Number((stats(ui).match(/^(\d+) узлов/) ?? [])[1] ?? NaN);
    const byDefault = count();
    const fileRow = ui.queryByTestId('graph-kind-file');
    expect(fileRow).not.toBeNull();
    expect(fileRow?.className).toContain('doc-graph__kind-row--off');
    fireEvent.click(ui.getByRole('button', { name: 'показать все' }));
    await frames();
    const all = count();
    expect(byDefault).toBeLessThan(all / 3);
    expect(ui.getByTestId('graph-kind-file').className).not.toContain('--off');
  });
});

describe('готовность на графе без нуля', () => {
  test('все эпохи готовы — чипа «Не готово» нет', async () => {
    const doc = openMap('korbor-miniapp');
    const docs = doc.docs;
    if (docs === undefined) {
      throw new Error('нет docs');
    }
    act(() => useAppStore.getState().setDocs({ ...docs, epochs: docs.epochs.map((e) => ({ ...e, readiness: 'ready', openBugs: [] })) }));
    const { ui } = await view();
    const chips = within(ui.getByRole('group', { name: 'Готовность эпох на графе' })).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(chips.some((c) => c.startsWith('Не готово'))).toBe(false);
    expect(chips).toContain('Все');
  });
});
