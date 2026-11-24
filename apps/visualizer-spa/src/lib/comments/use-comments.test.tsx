/**
 * Хуки замечаний оболочки: выбор компонента в живых экранах (включение пикера,
 * сообщения «выбран» и «отменён») и синхронизация веток карты.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { SCREEN_ATTR } from '../../flow/page-node/ScreenView';
import { startFakeStream, type FakeStream } from '../../test/fake-stream';
import { pickPageOf, useCommentPicker, useCommentsSync } from './use-comments';

useDom();

function Shell() {
  useCommentsSync();
  useCommentPicker();
  return null;
}

let stream: FakeStream;

/** Живой экран: страница открыта на сервере, холст ноды на карте. */
function liveScreen(pageId: string): void {
  useAppStore.setState((s) => ({ mountedPageIds: new Set([...s.mountedPageIds, pageId]) }));
  const canvas = document.createElement('canvas');
  canvas.setAttribute(SCREEN_ATTR, pageId);
  canvas.width = 390;
  document.body.append(canvas);
}

/** Сообщение страницы экрана дошло до карты. */
async function fromPage(pageId: string, data: unknown): Promise<void> {
  await stream.page(pageId, data);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

const PICKED = {
  lam: 'picked',
  selector: '#buy',
  domPath: 'main > button#buy',
  tag: 'button',
  text: 'Купить',
  rect: { x: 10, y: 20, width: 100, height: 30 },
  client: { x: 10, y: 20, width: 100, height: 30 },
  viewport: { width: 390, height: 844 },
  component: { name: 'BuyButton', chain: ['BuyButton'], stack: null },
};

/** EventSource браузера (в happy-dom его нет): запоминает адрес, события шлёт тест. */
class FakeEventSource {
  static readonly opened: FakeEventSource[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<() => void>>();
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** Событие сервера. */
  emit(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn();
    }
  }
  close(): void {
    this.closed = true;
  }
}

let net: ReturnType<typeof stubFetch>;
const realEventSource: unknown = Reflect.get(globalThis, 'EventSource');

beforeEach(() => {
  resetStores();
  stream = startFakeStream();
  FakeEventSource.opened.length = 0;
  Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, configurable: true, writable: true });
  net = stubFetch((url) => (url.startsWith('/api/comments?') ? jsonResponse({ comments: [] }) : undefined));
});

afterEach(() => {
  stream.stop();
  document.body.querySelectorAll('canvas').forEach((c) => c.remove());
  net.restore();
  Object.defineProperty(globalThis, 'EventSource', { value: realEventSource, configurable: true, writable: true });
});

function pageId(): string {
  const p = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page');
  if (p === undefined) {
    throw new Error('нет экранов');
  }
  return p.id;
}

describe('хуки замечаний', () => {
  test('открытая карта — ветки грузятся по её имени', async () => {
    render(<Shell />);
    expect(useCommentsStore.getState().mapName).toBeNull();
    const name = openMap('korbor-miniapp').project.name ?? 'без имени';
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(useCommentsStore.getState().mapName).toBe(name);
    expect(net.calls.map((c) => c.url)).toEqual([`/api/comments?mapName=${encodeURIComponent(name)}`]);
  });

  test('событие потока changed — ветки перечитываются; размонтирование закрывает поток', async () => {
    const view = render(<Shell />);
    const name = openMap('korbor-miniapp').project.name ?? 'без имени';
    const settle = (): Promise<void> => act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await settle();
    const source = FakeEventSource.opened.at(-1);
    expect(source?.url).toBe('/api/comments/stream');
    const before = net.calls.length;
    act(() => {
      source?.emit('changed');
    });
    await settle();
    expect(net.calls.slice(before).map((c) => c.url)).toEqual([`/api/comments?mapName=${encodeURIComponent(name)}`]);
    view.unmount();
    expect(source?.closed).toBe(true);
  });

  test('выбранный экран сразу в выборе: клик по компоненту — окно у него, выбор включается снова; чужие сообщения не в счёт', async () => {
    openMap('korbor-miniapp');
    useAppStore.getState().setMode('live');
    const id = pageId();
    liveScreen(id);
    render(<Shell />);
    await fromPage(id, PICKED);
    expect(useCommentsStore.getState().target).toBeNull();
    act(() => useAppStore.getState().selectPage(id));
    await stream.ready();
    await fromPage(id, { lam: 'что-то другое' });
    expect(stream.postsTo(id)).toContainEqual({ lam: 'pick', on: true });
    await fromPage('чужой-экран', PICKED);
    expect(useCommentsStore.getState().target).toBeNull();
    await fromPage(id, PICKED);
    const target = useCommentsStore.getState().target;
    expect(target?.anchor).toMatchObject({ pageId: id, element: { selector: '#buy', component: { name: 'BuyButton' } } });
    expect(target?.frame).toEqual({ rect: PICKED.client, pageWidth: 390 });
    // Страница выключает выбор после клика — карта сразу включает его снова: следующий компонент одним кликом
    const before = stream.postsTo(id).length;
    await fromPage(id, PICKED);
    expect(stream.postsTo(id).slice(before)).toEqual([{ lam: 'pick', on: true }]);
  });

  test('режим «Приложение» (I) выключает выбор; снятие фокуса — тоже', async () => {
    openMap('korbor-miniapp');
    useAppStore.getState().setMode('live');
    const id = pageId();
    liveScreen(id);
    render(<Shell />);
    act(() => useAppStore.getState().selectPage(id));
    await stream.ready();
    act(() => useAppStore.getState().setInteract(id));
    await fromPage(id, PICKED);
    expect(stream.postsTo(id).at(-1)).toEqual({ lam: 'pick', on: false });
    expect(useCommentsStore.getState().target).toBeNull();
    expect(pickPageOf({ selectedPageId: id, interactPageId: null, mountedPageIds: new Set([id]), mode: 'live' }, false)).toBeNull();
    expect(pickPageOf({ selectedPageId: id, interactPageId: null, mountedPageIds: new Set(), mode: 'live' }, true)).toBeNull();
  });

  test('Esc в странице: сначала закрывает окно замечания, потом снимает фокус экрана', async () => {
    openMap('korbor-miniapp');
    useAppStore.getState().setMode('live');
    const id = pageId();
    liveScreen(id);
    render(<Shell />);
    act(() => useAppStore.getState().selectPage(id));
    await fromPage(id, PICKED);
    expect(useCommentsStore.getState().target).not.toBeNull();
    await fromPage(id, { lam: 'pick-cancel' });
    expect(useCommentsStore.getState().target).toBeNull();
    expect(useAppStore.getState().selectedPageId).toBe(id);
    await fromPage(id, { lam: 'pick-cancel' });
    expect(useAppStore.getState().selectedPageId).toBeNull();
  });
});
