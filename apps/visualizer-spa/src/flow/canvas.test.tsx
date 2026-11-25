/**
 * Холст карты как у пользователя: рамки групп, экраны и сервисы, рёбра, поиск без
 * совпадений и сброс, выбор ноды и клик по пустому месту, живой экран (холст трансляции
 * и набор экранов серверу), снимок шлюза до первого кадра, стейты, размеры окна, кнопки шапки ноды.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';
import { useStreamSync } from '../lib/stream/stream-sync';
import { startFakeStream } from '../test/fake-stream';
import { openMap, resetStores } from '../test/fixtures';
import { AppMapCanvas, applyZoomStyle, canvasView, OVERVIEW_ZOOM } from './AppMapCanvas';
import { API_DOMAIN_PREFIX, withApiDomains } from './api-domain-graph';
import { VISIBILITY_SETTLE_MS } from './page-node/use-node-visibility';
import { focusCamera, MAX_ZOOM } from './RevealSelected';

useDom();

const opened: string[] = [];
let realOpen: typeof window.open | null = null;

beforeEach(() => {
  resetStores();
  realOpen = window.open;
  opened.length = 0;
  window.open = (url?: string | URL) => {
    opened.push(String(url));
    return null;
  };
});

afterEach(() => {
  if (realOpen !== null) {
    window.open = realOpen;
  }
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
    // Сервисы на холсте заменены доменами API
    expect(r.container.querySelectorAll('.service-node').length).toBe(withApiDomains(doc).nodes.filter((n) => n.kind === 'service').length);
    expect(r.container.querySelectorAll('.service-node').length).toBeGreaterThan(1);
    const counts = [...r.container.querySelectorAll('.group-frame__count')].map((el) => Number(el.textContent));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(r.container.querySelectorAll('.page-node, .service-node').length);
    expect(r.container.querySelector('.service-node__stats')?.textContent).toMatch(/роуты \d+экраны \d+/);
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

  test('видимая нода — холст трансляции и живой экран в наборе сервера; невидимая — подсказка', async () => {
    const stream = startFakeStream();
    const Synced = () => {
      useStreamSync();
      return <AppMapCanvas />;
    };
    const doc = openMap('korbor-miniapp');
    const r = render(<Synced />);
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useAppStore.getState().setVisible(new Set([id])));
    await settle();
    expect(r.container.querySelector('iframe')).toBeNull();
    expect(nodeEl(r.container, id).querySelector('canvas')?.getAttribute('data-lam-screen')).toBe(id);
    expect(nodeEl(r.container, id).dataset['lamLive']).toBe('1');
    await waitFor(() => {
      const sync = stream.received.filter((m) => m.t === 'sync').at(-1);
      expect(sync?.t === 'sync' ? sync.screens.find((s) => s.key === id) : undefined).toMatchObject({ url: useAppStore.getState().resolveLiveUrl(id), live: true });
    });
    const hidden = doc.nodes.filter((n) => n.kind === 'page')[1]?.id ?? '';
    expect(nodeEl(r.container, hidden).querySelector('.page-node__placeholder')?.textContent).toBe('Экран оживёт, когда попадёт в кадр');
    r.unmount();
    stream.stop();
  });

  test('шлюз: до первого кадра под холстом снимок; вне кадра — снимок вместо холста, сбой снимка — подсказка', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useGatewayStore.setState({ port: 4320 }));
    act(() => useAppStore.getState().setVisible(new Set([id])));
    await settle();
    const under = nodeEl(r.container, id).querySelector('img[data-lam-snapshot]');
    expect(under?.getAttribute('src')).toContain('/__lam_snapshot');
    expect(nodeEl(r.container, id).querySelector('canvas')).not.toBeNull();
    act(() => useAppStore.getState().setVisible(new Set()));
    await settle();
    const other = doc.nodes.filter((n) => n.kind === 'page')[1]?.id ?? '';
    const shot = nodeEl(r.container, other).querySelector('img[data-lam-snapshot]');
    expect(shot?.getAttribute('alt')).toStartWith('Экран: ');
    if (shot !== null) {
      fireEvent.error(shot);
    }
    expect(nodeEl(r.container, other).querySelector('img[data-lam-snapshot]')).toBeNull();
    expect(nodeEl(r.container, other).querySelector('.page-node__placeholder')).not.toBeNull();
  });

  test('кнопки ноды: закрепить и открепить, открыть во вкладке', async () => {
    const { doc, r } = await canvas();
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    fireEvent.mouseEnter(nodeEl(r.container, id));
    const node = within(nodeEl(r.container, id));
    fireEvent.click(node.getByLabelText('Закрепить'));
    expect(useAppStore.getState().pinnedPageIds.has(id)).toBe(true);
    fireEvent.click(within(nodeEl(r.container, id)).getByLabelText('Открепить'));
    expect(useAppStore.getState().pinnedPageIds.has(id)).toBe(false);
    fireEvent.click(node.getByLabelText('Открыть во вкладке'));
    expect(opened).toEqual([useAppStore.getState().resolveLiveUrl(id) ?? '']);
  });

  test('карточка в покое — название и путь; кнопки под мышью; выбранная — без кнопок (они в плашке фокуса), с размером окна, остальные гаснут', async () => {
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
    fireEvent.mouseEnter(el());
    expect(el().querySelector('.page-node__actions')).toBeNull();
    expect(el().querySelector('.page-node__size')?.textContent).toMatch(/\d+×\d+/);
    expect(r.container.querySelector('.flow-host')?.classList.contains('flow-host--focus')).toBe(true);
    const others = doc.nodes.filter((n) => n.kind === 'page' && n.id !== id);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((n) => nodeEl(r.container, n.id).querySelector('.page-node--dim') !== null || nodeEl(r.container, n.id).classList.contains('page-node--dim'))).toBe(true);
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

  test('API по доменам: в покое линий к API нет, выбран домен — видны все его экраны', () => {
    const doc = openMap('korbor-miniapp');
    const sizing: Parameters<typeof canvasView>[2] = { iframeScale: useAppStore.getState().iframeScale, nodeViewports: new Map(), contentHeights: new Map() };
    const graphOf = (selected: string | null) => {
      const view = canvasView(doc, '', sizing, selected);
      return view.kind === 'graph' ? view.graph : null;
    };
    const idle = graphOf(null);
    const domains = (idle?.nodes ?? []).filter((n) => n.id.startsWith(API_DOMAIN_PREFIX));
    expect(domains.length).toBeGreaterThan(1);
    const toApi = (e: { readonly target: string }) => e.target.startsWith(API_DOMAIN_PREFIX);
    expect((idle?.edges ?? []).filter((e) => toApi(e) && e.hidden !== true)).toEqual([]);
    const busiest = withApiDomains(doc).nodes.reduce((a, b) => (Number(b.metadata?.['screens']) > Number(a.metadata?.['screens'] ?? -1) ? b : a));
    const shown = (graphOf(busiest.id)?.edges ?? []).filter((e) => toApi(e) && e.hidden !== true);
    expect(shown.length).toBe(Number(busiest.metadata?.['screens']));
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.every((e) => e.target === busiest.id && e.label !== undefined)).toBe(true);
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

  test('фокус экрана: короткий вписан по высоте под шапкой и над плашкой; длинная страница — крупно от верха', () => {
    const view = { width: 1440, height: 900 };
    const short = focusCamera({ x: 0, y: 0, w: 390, h: 600 }, view);
    // Высота окна без шапки и плашки — 740: короткий экран увеличен до неё
    expect(short.zoom).toBeCloseTo(740 / 600, 5);
    // Центр ниже середины ноды на половину разницы плашки и шапки
    expect(short.y).toBeGreaterThan(300);
    const tall = focusCamera({ x: 0, y: 0, w: 390, h: 4000 }, view);
    expect(tall.zoom).toBe(MAX_ZOOM);
    // Верх страницы — сразу под шапкой: центр окна на (высота/2 − шапка) ниже верха ноды
    expect(tall.y).toBeLessThan(view.height / 2);
    const mid = focusCamera({ x: 0, y: 0, w: 390, h: 1000 }, view);
    expect(mid.zoom).toBeLessThan(MAX_ZOOM);
    expect(mid.zoom * 1000).toBeLessThanOrEqual(view.height);
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

  test('нода вошла в кадр — видима и живая после остановки камеры; вышла — нет; промежуточная доля ничего не меняет', async () => {
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
      const report = async (ratio: number): Promise<void> => {
        const cb = body === null ? undefined : watchers.get(body);
        act(() => {
          if (cb !== undefined) {
            Reflect.apply(cb, undefined, [[{ intersectionRatio: ratio, target: body }], {}]);
          }
        });
        await act(async () => {
          await new Promise((done) => setTimeout(done, VISIBILITY_SETTLE_MS + 30));
        });
      };
      const cb = body === null ? undefined : watchers.get(body);
      act(() => {
        if (cb !== undefined) {
          Reflect.apply(cb, undefined, [[{ intersectionRatio: 0.5, target: body }], {}]);
        }
      });
      // Камера ещё движется — набор живых не трогаем
      expect(useAppStore.getState().visiblePageIds.has(id)).toBe(false);
      await report(0.5);
      expect(useAppStore.getState().visiblePageIds.has(id)).toBe(true);
      expect(useAppStore.getState().livePageIds.has(id)).toBe(true);
      const same = useAppStore.getState().visiblePageIds;
      await report(0.1);
      expect(useAppStore.getState().visiblePageIds).toBe(same);
      await report(0);
      expect(useAppStore.getState().visiblePageIds.has(id)).toBe(false);
    } finally {
      Reflect.set(window, 'IntersectionObserver', Real);
    }
  });
});
