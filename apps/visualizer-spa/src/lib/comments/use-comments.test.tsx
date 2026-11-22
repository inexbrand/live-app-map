/**
 * Хуки замечаний оболочки: выбор компонента в живых экранах (включение пикера,
 * сообщения «выбран» и «отменён») и синхронизация веток карты.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { useSnapshotStore } from '../../store/snapshot-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { NODE_IFRAME_ATTR } from '../gateway/use-gateway-frames';
import { useCommentPicker, useCommentsSync } from './use-comments';

useDom();

function Shell() {
  useCommentsSync();
  useCommentPicker();
  return null;
}

/** Живой экран: iframe ноды, чьё окно записывает сообщения визуализатора. */
function liveFrame(pageId: string): { readonly win: object; readonly sent: unknown[] } {
  const sent: unknown[] = [];
  const win = { postMessage: (data: unknown) => sent.push(data) };
  const frame = document.createElement('iframe');
  frame.setAttribute(NODE_IFRAME_ATTR, pageId);
  frame.setAttribute('width', '390');
  Object.defineProperty(frame, 'contentWindow', { value: win });
  document.body.append(frame);
  return { win, sent };
}

function fromPage(data: unknown, source: object | null): void {
  const e = new MessageEvent('message', { data });
  Object.defineProperty(e, 'source', { value: source });
  act(() => {
    window.dispatchEvent(e);
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

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  net = stubFetch((url) => (url.startsWith('/api/comments?') ? jsonResponse({ comments: [] }) : undefined));
});

afterEach(() => net.restore());

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

  test('выбор компонента: пикер включается, выбор открывает черновик и захват; без выбора — сообщения не в счёт', () => {
    openMap('korbor-miniapp');
    const id = pageId();
    const page = liveFrame(id);
    const other = liveFrame('нет-такой-ноды');
    render(<Shell />);
    fromPage(PICKED, page.win);
    expect(useCommentsStore.getState().draft).toBeNull();
    act(() => {
      useSnapshotStore.getState().request({ kind: 'comment', pick: 'element', pageId: id });
      useSnapshotStore.getState().opened();
    });
    expect(page.sent).toContainEqual({ lam: 'pick', on: true });
    fromPage({ lam: 'что-то другое' }, page.win);
    fromPage(PICKED, {});
    fromPage(PICKED, other.win);
    expect(useCommentsStore.getState().draft).toBeNull();
    fromPage(PICKED, page.win);
    const draft = useCommentsStore.getState().draft;
    expect(draft?.anchor).toMatchObject({ pageId: id, element: { selector: '#buy', component: { name: 'BuyButton' } } });
    expect(draft?.shot).toBe('pending');
    expect(useSnapshotStore.getState().session.phase).toBe('capturing');
    expect(page.sent.at(-1)).toEqual({ lam: 'pick', on: false });
  });

  test('Esc в странице отменяет выбор', () => {
    openMap('korbor-miniapp');
    const page = liveFrame(pageId());
    render(<Shell />);
    act(() => {
      useSnapshotStore.getState().request({ kind: 'comment', pick: 'element', pageId: null });
      useSnapshotStore.getState().opened();
    });
    fromPage({ lam: 'pick-cancel' }, page.win);
    expect(useSnapshotStore.getState().session.phase).toBe('idle');
  });
});
