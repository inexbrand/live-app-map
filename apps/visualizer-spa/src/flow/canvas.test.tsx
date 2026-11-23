/**
 * Холст карты как у пользователя: рамки групп, экраны и сервисы, рёбра, поиск без
 * совпадений и сброс, выбор ноды и клик по пустому месту, живой экран (iframe, загрузка,
 * ошибка), снимок шлюза у замороженной ноды, стейты, размеры окна, кнопки шапки ноды.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';
import { useSnapshotStore } from '../store/snapshot-store';
import { openMap, resetStores } from '../test/fixtures';
import { AppMapCanvas, applyZoomStyle, canvasView, OVERVIEW_ZOOM } from './AppMapCanvas';

useDom();

const opened: string[] = [];
/** happy-dom не грузит iframe и шлёт им error; браузер у чужого адреса error не шлёт — глушим, пока тест не разрешит. */
let frameErrors = false;
const muteFrameErrors = (e: Event): void => {
  if (!frameErrors && e.target instanceof HTMLIFrameElement) {
    e.stopPropagation();
  }
};
let realOpen: typeof window.open | null = null;

beforeEach(() => {
  resetStores();
  realOpen = window.open;
  opened.length = 0;
  frameErrors = false;
  window.addEventListener('error', muteFrameErrors, true);
  window.open = (url?: string | URL) => {
    opened.push(String(url));
    return null;
  };
});

afterEach(() => {
  if (realOpen !== null) {
    window.open = realOpen;
  }
  window.removeEventListener('error', muteFrameErrors, true);
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 40));
  });
}

async function canvas() {
  const doc = openMap('korbor-miniapp');
  const r = render(<AppMapCanvas />);
  await settle();
  return { doc, r, box: within(r.container) };
}

function nodeEl(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`.page-node[data-page-id="${CSS.escape(id)}"]`);
  if (el === null) {
    throw new Error(`нет ноды ${id}`);
  }
  return el;
}

describe('холст карты', () => {
  test('без карты — пусто; с картой — рамки групп со счётом, экраны, сервисы, рёбра', async () => {
    const empty = render(<AppMapCanvas />);
    expect(empty.container.innerHTML).toBe('');
    empty.unmount();
    const { doc, r } = await canvas();
    const pages = doc.nodes.filter((n) => n.kind === 'page');
    expect(r.container.querySelectorAll('.page-node').length).toBe(pages.length);
    expect(r.container.querySelectorAll('.service-node').length).toBe(doc.nodes.filter((n) => n.kind === 'service').length);
    const counts = [...r.container.querySelectorAll('.group-frame__count')].map((el) => Number(el.textContent));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(r.container.querySelectorAll('.page-node, .service-node').length);
    expect(r.container.querySelector('.service-node__stats')?.textContent).toMatch(/роуты \d+таблицы \d+функции \d+/);
  });

  test('фильтр без совпадений — «Ничего не найдено» и сброс', async () => {
    const { box } = await canvas();
    act(() => useAppStore.getState().setSearchQuery('zzzqqq'));
    expect(box.getByText('Ничего не найдено')).toBeTruthy();
    expect(box.getByText('«zzzqqq»')).toBeTruthy();
    fireEvent.click(box.getByText('Сбросить поиск'));
    expect(useAppStore.getState().searchQuery).toBe('');
    expect(box.queryByText('Ничего не найдено')).toBeNull();
  });

  test('клик по ноде выбирает экран и показывает размеры окна; клик по пустому месту снимает выбор', async () => {
    const { doc, r } = await canvas();
    const page = doc.nodes.find((n) => n.kind === 'page');
    const id = page?.id ?? '';
    fireEvent.click(nodeEl(r.container, id));
    await settle();
    expect(useAppStore.getState().selectedPageId).toBe(id);
    expect(nodeEl(r.container, id).className).toContain('page-node--selected');
    expect(nodeEl(r.container, id).querySelector('.page-node__viewport-bar')).not.toBeNull();
    const pane = r.container.querySelector('.react-flow__pane');
    if (pane !== null) {
      fireEvent.click(pane);
    }
    await settle();
    expect(useAppStore.getState().selectedPageId).toBeNull();
    fireEvent.doubleClick(nodeEl(r.container, id));
    expect(useAppStore.getState().interactPageId).toBe(id);
  });

  test('размеры окна: пресет ширины и «целиком» ↔ окно', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useAppStore.getState().selectPage(id));
    await settle();
    const bar = nodeEl(r.container, id).querySelector('.page-node__viewport-bar');
    const buttons = [...(bar?.querySelectorAll('button') ?? [])];
    const preset = buttons.find((b) => !b.hasAttribute('data-lam-full-height') && !b.className.includes('--on'));
    if (preset !== undefined) {
      fireEvent.click(preset);
    }
    const after = useAppStore.getState().nodeViewports.get(id);
    expect(preset?.textContent).toBe(after?.label ?? '');
    expect(preset?.getAttribute('title')).toBe(`${after?.label} · ${after?.width}px · height ${after?.heightMode}`);
    const toggle = (): string | undefined => {
      const full = nodeEl(r.container, id).querySelector('[data-lam-full-height]');
      if (full !== null) {
        fireEvent.click(full);
      }
      return useAppStore.getState().nodeViewports.get(id)?.heightMode;
    };
    const first = toggle();
    expect(first).toBe(after?.heightMode === 'auto' ? 'fixed' : 'auto');
    expect(toggle()).toBe(after?.heightMode);
  });

  test('стейты экрана: чип включает стейт, повторный клик — выключает', async () => {
    const { doc, r } = await canvas();
    const page = doc.nodes.find((n) => n.kind === 'page' && (n.states?.length ?? 0) > 0);
    const id = page?.id ?? '';
    const chip = nodeEl(r.container, id).querySelector<HTMLElement>('.page-node__states button');
    if (chip === null) {
      throw new Error('нет чипа стейта');
    }
    fireEvent.click(chip);
    expect(useAppStore.getState().activeStates.get(id)).toBe(page?.states?.[0]?.name);
    fireEvent.click(chip);
    expect(useAppStore.getState().activeStates.has(id)).toBe(false);
  });

  test('видимая нода — живой iframe, загрузка в логе; невидимая — заглушка', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useAppStore.getState().setVisible(new Set([id])));
    await settle();
    const frame = nodeEl(r.container, id).querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(useAppStore.getState().resolveLiveUrl(id));
    expect(nodeEl(r.container, id).dataset['lamLive']).toBe('1');
    if (frame !== null) {
      fireEvent.load(frame);
    }
    await settle();
    const logs = useAppStore.getState().logs.filter((l) => l.source === id).map((l) => l.message);
    expect(logs).toEqual([`iframe load 390×844 · ${useAppStore.getState().resolveLiveUrl(id)}`]);
    const hidden = doc.nodes.filter((n) => n.kind === 'page')[1]?.id ?? '';
    expect(nodeEl(r.container, hidden).querySelector('.page-node__placeholder')?.textContent).toBeTruthy();
    // React не вешает onError на iframe: ошибка загрузки iframe не доходит до ноды
    frameErrors = true;
    fireEvent.error(nodeEl(r.container, id).querySelector('iframe') ?? document.body);
    expect(nodeEl(r.container, id).querySelector('iframe')).not.toBeNull();
  });

  test('шлюз: живой iframe со снимком под ним; вне кадра — снимок вместо iframe, сбой снимка — заглушка', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useGatewayStore.setState({ port: 4320 }));
    act(() => useAppStore.getState().setVisible(new Set([id])));
    await settle();
    const under = nodeEl(r.container, id).querySelector('.page-node__snapshot--under');
    expect(under?.getAttribute('src')).toContain('/__lam_snapshot');
    act(() => useAppStore.getState().setVisible(new Set()));
    await settle();
    const other = doc.nodes.filter((n) => n.kind === 'page')[1]?.id ?? '';
    const shot = nodeEl(r.container, other).querySelector('img[data-lam-snapshot]');
    expect(shot?.getAttribute('alt')).toStartWith('Снимок: ');
    if (shot !== null) {
      fireEvent.error(shot);
    }
    expect(nodeEl(r.container, other).querySelector('img[data-lam-snapshot]')).toBeNull();
  });

  test('кнопки ноды: статус и лог экрана (выбор экрана), закрепить и открепить, открыть во вкладке, замечание', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    fireEvent.mouseEnter(nodeEl(r.container, id));
    const node = within(nodeEl(r.container, id));
    fireEvent.click(node.getByLabelText('Лог экрана'));
    expect(useAppStore.getState().selectedPageId).toBe(id);
    fireEvent.click(node.getByLabelText('Закрепить'));
    expect(useAppStore.getState().pinnedPageIds.has(id)).toBe(true);
    fireEvent.click(within(nodeEl(r.container, id)).getByLabelText('Открепить'));
    expect(useAppStore.getState().pinnedPageIds.has(id)).toBe(false);
    fireEvent.click(node.getByLabelText('Открыть во вкладке'));
    expect(opened).toEqual([useAppStore.getState().resolveLiveUrl(id) ?? '']);
    fireEvent.click(node.getByLabelText('Замечание к компоненту'));
    expect(useSnapshotStore.getState().session.phase).toBe('opening');
    expect(useAppStore.getState().selectedPageId).toBe(id);
  });

  test('карточка в покое — название и путь; кнопки под мышью, размер окна — у выбранной', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    const el = (): HTMLElement => nodeEl(r.container, id);
    expect(el().querySelector('.page-node__actions')).toBeNull();
    expect(el().querySelector('.page-node__size')).toBeNull();
    expect(el().querySelector('.page-node__title')?.textContent).not.toBe('');
    fireEvent.mouseEnter(el());
    expect(el().querySelector('.page-node__actions')).not.toBeNull();
    expect(el().querySelector('.page-node__size')).toBeNull();
    fireEvent.mouseLeave(el());
    expect(el().querySelector('.page-node__actions')).toBeNull();
    act(() => useAppStore.getState().selectPage(id));
    await settle();
    expect(el().querySelector('.page-node__actions')).not.toBeNull();
    expect(el().querySelector('.page-node__size')?.textContent).toMatch(/\d+×\d+/);
    expect(r.container.querySelectorAll('.page-node .ui-badge').length === 0 || ![...r.container.querySelectorAll('.page-node .ui-badge')].some((b) => /^(live|warm)$/.test(b.textContent ?? ''))).toBe(true);
  });

  test('обзор: при отдалении у холста класс обзора и масштаб для подписей; при приближении — нет', async () => {
    const { r } = await canvas();
    const host = r.container.querySelector<HTMLElement>('.flow-host');
    expect(host).not.toBeNull();
    applyZoomStyle(host, OVERVIEW_ZOOM / 4);
    expect(host?.classList.contains('flow-host--overview')).toBe(true);
    expect(host?.style.getPropertyValue('--lam-zoom')).toBe(String(OVERVIEW_ZOOM / 4));
    applyZoomStyle(host, 1);
    expect(host?.classList.contains('flow-host--overview')).toBe(false);
    expect(host?.style.getPropertyValue('--lam-zoom')).toBe('1');
  });

  test('подписи рёбер — только у выбранного экрана', () => {
    const doc = openMap('korbor-miniapp');
    const sizing: Parameters<typeof canvasView>[2] = { iframeScale: useAppStore.getState().iframeScale, nodeViewports: new Map(), contentHeights: new Map() };
    const edgesOf = (selected: string | null) => {
      const view = canvasView(doc, '', sizing, selected);
      return view.kind === 'graph' ? view.graph.edges : [];
    };
    const all = edgesOf(null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((e) => e.label !== undefined)).toEqual([]);
    const labeled = doc.edges.find((e) => e.label !== undefined && e.label !== '' && e.to !== null);
    const picked = edgesOf(labeled?.from ?? null);
    const withLabel = picked.filter((e) => e.label !== undefined);
    expect(withLabel.map((e) => e.label)).toContain(labeled?.label);
    expect(withLabel.every((e) => e.source === labeled?.from || e.target === labeled?.from)).toBe(true);
  });

  test('выбранная нода под шапкой — холст сдвигается вниз на просвет', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    bar.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 1440, height: 60 });
    document.body.append(bar);
    const el = r.container.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
    if (el === null) {
      throw new Error('нет ноды');
    }
    el.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 20, width: 300, height: 400 });
    const viewport = () => r.container.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '';
    const before = viewport();
    act(() => useAppStore.getState().selectPage(id));
    // 60 (низ шапки) + 16 (отступ) − 20 (верх ноды) = 56 px вниз
    await waitFor(() => expect(viewport()).not.toBe(before), { timeout: 1500 });
    const ty = (s: string): number => Number(/translate\([-\d.]+px, ?([-\d.]+)px\)/.exec(s)?.[1]);
    await waitFor(() => expect(ty(viewport()) - ty(before)).toBeCloseTo(56, 0), { timeout: 1500 });
  });

  test('выбранной ноды нет в DOM — холст центрируется по её координатам', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.filter((n) => n.kind === 'page').at(-1)?.id ?? '';
    const el = r.container.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
    el?.setAttribute('data-id', 'спрятана');
    const viewport = () => r.container.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '';
    const before = viewport();
    act(() => useAppStore.getState().selectPage(id));
    await waitFor(() => expect(viewport()).not.toBe(before), { timeout: 1500 });
    el?.setAttribute('data-id', id);
  });

  test('нода вошла в кадр — видима и живая; вышла — нет; промежуточная доля ничего не меняет', async () => {
    const watchers = new Map<Element, IntersectionObserverCallback>();
    const Real = window.IntersectionObserver;
    class FakeObserver {
      private readonly cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element): void {
        watchers.set(el, this.cb);
      }
      disconnect(): void {}
    }
    Reflect.set(window, 'IntersectionObserver', FakeObserver);
    try {
      const { doc, r } = await canvas();
      const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
      const body = nodeEl(r.container, id).querySelector('.page-node__body');
      const report = (ratio: number): void => {
        const cb = body === null ? undefined : watchers.get(body);
        act(() => {
          if (cb !== undefined) {
            Reflect.apply(cb, undefined, [[{ intersectionRatio: ratio, target: body }], {}]);
          }
        });
      };
      report(0.5);
      expect(useAppStore.getState().visiblePageIds.has(id)).toBe(true);
      expect(useAppStore.getState().livePageIds.has(id)).toBe(true);
      const same = useAppStore.getState().visiblePageIds;
      report(0.1);
      expect(useAppStore.getState().visiblePageIds).toBe(same);
      report(0);
      expect(useAppStore.getState().visiblePageIds.has(id)).toBe(false);
    } finally {
      Reflect.set(window, 'IntersectionObserver', Real);
    }
  });
});
