/**
 * Снимок экрана как у пользователя: просьба агента («Снять» → доступ к вкладке →
 * выделение → снимок агенту), замечание по области выбранного экрана, отказ в
 * доступе, браузер без захвата, клавиши C, ⇧C, ⌥⇧S. Захват вкладки — поддельный
 * getDisplayMedia с кадром 1440×900; холст — записывающий контекст.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { useSnapshotStore } from '../store/snapshot-store';
import { installCanvas } from '../test/canvas';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { anchorPage, screenAnchor } from '../lib/comments/page-anchor';
import { LamGrabHost } from './LamGrabHost';
import { SnapshotOverlay } from './SnapshotOverlay';

useDom();

type Media = { stopped: number; deny: 'none' | 'denied' };
const media: Media = { stopped: 0, deny: 'none' };
let agentRequest: unknown = null;
let net: ReturnType<typeof stubFetch>;
let canvas: ReturnType<typeof installCanvas>;

beforeEach(() => {
  resetStores();
  media.stopped = 0;
  media.deny = 'none';
  agentRequest = null;
  canvas = installCanvas(true);
  net = stubFetch((url, init) => {
    if (url.endsWith('/api/agent-state') && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({ ok: true, pendingSnapshotRequest: agentRequest });
    }
    if (url.endsWith('/api/agent-state')) {
      return jsonResponse({ ok: true });
    }
    if (url.endsWith('/api/agent-state/snapshot')) {
      return jsonResponse({ ok: true, snapshot: { file: '.lam/snapshots/1.png' } });
    }
    if (url.includes('/__lam_comments')) {
      return jsonResponse({ ok: true, comments: [] });
    }
    return undefined;
  });
  const getDisplayMedia = async (): Promise<MediaStream> => {
    if (media.deny === 'denied') {
      throw new DOMException('нет', 'NotAllowedError');
    }
    const stream = new MediaStream();
    const track = { stop: () => (media.stopped += 1) };
    Object.defineProperty(stream, 'getTracks', { value: () => [track] });
    return stream;
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
  Object.defineProperties(HTMLVideoElement.prototype, {
    play: { configurable: true, value: () => Promise.resolve() },
    videoWidth: { configurable: true, get: () => 1440 },
    videoHeight: { configurable: true, get: () => 900 },
  });
});

afterEach(() => {
  net.restore();
  canvas.restore();
});

function app() {
  return render(
    <div>
      <LamGrabHost />
      <SnapshotOverlay />
    </div>,
  );
}

function key(code: string, opts: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true, ...opts }));
  });
}

/** Выделить область мышью на слое снимка. */
function select(box: ReturnType<typeof within>, from: [number, number], to: [number, number]): void {
  const layer = box.getByTestId('snapshot-overlay');
  layer.setPointerCapture = () => undefined;
  fireEvent.pointerDown(layer, { clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(layer, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(layer, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

const phase = () => useSnapshotStore.getState().session.phase;

describe('снимок экрана', () => {
  test('просьба агента: «Снять» → доступ → выделение → снимок агенту, поток закрыт', async () => {
    openMap('korbor-miniapp');
    agentRequest = { id: 'req-1', note: 'покажи ленту', requestedAt: '2026-11-22T00:00:00Z' };
    const r = app();
    const box = within(r.container);
    await waitFor(() => expect(box.getByRole('dialog', { name: 'Просьба агента' })).toBeTruthy());
    expect(box.getByText('покажи ленту')).toBeTruthy();
    fireEvent.click(box.getByText('Снять'));
    await waitFor(() => expect([phase(), useAppStore.getState().toast]).toEqual(['selecting', null]));
    // Мелкое выделение — не снимок
    select(box, [10, 10], [12, 12]);
    expect(phase()).toBe('selecting');
    select(box, [100, 100], [500, 400]);
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Снимок отправлен агенту: .lam/snapshots/1.png'));
    expect(phase()).toBe('idle');
    expect(media.stopped).toBe(1);
    const upload = net.calls.find((c) => c.url.endsWith('/api/agent-state/snapshot'));
    expect(upload?.body).toContain('"requestId":"req-1"');
  });

  test('просьба агента: отказ в доступе — сессия закрыта, toast с причиной; «Отмена» — без снимка', async () => {
    openMap('korbor-miniapp');
    media.deny = 'denied';
    agentRequest = { id: 'req-2', requestedAt: '2026-11-22T00:00:00Z' };
    const r = app();
    const box = within(r.container);
    await waitFor(() => expect(box.getByText('Снять')).toBeTruthy());
    fireEvent.click(box.getByText('Снять'));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Снимок: доступ к экрану не дан'));
    expect(phase()).toBe('idle');
    act(() => {
      useSnapshotStore.getState().request({ kind: 'agent', requestId: 'req-3', note: null });
    });
    fireEvent.click(box.getByText('Отмена'));
    expect(phase()).toBe('idle');
  });

  test('⌥⇧S: замечание по области выбранного экрана — черновик со снимком; без экрана — подсказка', async () => {
    const doc = openMap('korbor-miniapp');
    const r = app();
    const box = within(r.container);
    key('KeyS', { altKey: true, shiftKey: true });
    expect(useAppStore.getState().toast).toBe('Выберите экран, к которому относится область');
    const page = doc.nodes.find((n) => n.kind === 'page');
    act(() => useAppStore.getState().selectPage(page?.id ?? null));
    key('KeyS', { altKey: true, shiftKey: true });
    await waitFor(() => expect(phase()).toBe('selecting'));
    expect(box.getByText(/Выделите область для снимка/)).toBeTruthy();
    select(box, [50, 60], [450, 360]);
    await waitFor(() => expect(useCommentsStore.getState().draft).not.toBeNull());
    expect(useCommentsStore.getState().draft?.viewRect).toEqual({ x: 50, y: 60, width: 400, height: 300 });
    expect(useCommentsStore.getState().draft?.shot).toStartWith('data:');
    // Кадр 1440×900: область масштабирована в пиксели кадра
    expect(canvas.ctx.log.at(-1)).toBe(`drawImage(${[50 * 1440 / window.innerWidth, 60 * 900 / window.innerHeight, 400 * 1440 / window.innerWidth, 300 * 900 / window.innerHeight].map((v) => Math.round(v)).join(',')},0,0,${Math.round(400 * 1440 / window.innerWidth)},${Math.round(300 * 900 / window.innerHeight)})`);
    // Поток держится для следующего замечания
    expect(media.stopped).toBe(0);
  });

  test('C — выбор компонента: подсказка, «Область» переключает на выделение; Esc отменяет', async () => {
    openMap('korbor-miniapp');
    const r = app();
    const box = within(r.container);
    key('KeyC');
    await waitFor(() => expect(box.getByTestId('pick-hint')).toBeTruthy());
    fireEvent.click(box.getByText('Область'));
    // Без выбранного экрана область недоступна — выбор компонента остаётся
    expect(useAppStore.getState().toast).toBe('Выберите экран, к которому относится область');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(phase()).toBe('idle');
  });

  test('браузер без захвата экрана — понятная причина в toast', async () => {
    openMap('korbor-miniapp');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    app();
    act(() => {
      useSnapshotStore.getState().request({ kind: 'agent', requestId: 'r', note: null });
      useSnapshotStore.getState().accept();
    });
    await waitFor(() => expect(useAppStore.getState().toast).toStartWith('Снимок: браузер не умеет снимать экран'));
  });

  test('выбор компонента без доступа к вкладке: замечание продолжается без снимка', async () => {
    openMap('korbor-miniapp');
    media.deny = 'denied';
    const r = app();
    key('KeyC');
    await waitFor(() => expect(within(r.container).getByTestId('pick-hint')).toBeTruthy());
    expect(useAppStore.getState().toast).toBe('Снимок недоступен (доступ к экрану не дан) — замечание сохранится без него');
  });

  test('⇧C открывает и закрывает список замечаний; в поле и с ⌘ — нет; без карты — ничего', () => {
    const r = app();
    key('KeyC', { shiftKey: true });
    expect(useCommentsStore.getState().listOpen).toBe(false);
    act(() => {
      openMap('korbor-miniapp');
    });
    key('KeyC', { shiftKey: true });
    expect(useCommentsStore.getState().listOpen).toBe(true);
    key('KeyC', { shiftKey: true, metaKey: true });
    expect(useCommentsStore.getState().listOpen).toBe(true);
    const input = document.createElement('input');
    r.container.append(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
    });
    expect(phase()).toBe('idle');
  });

  test('карту закрыли посреди выделения — сессия отменена', async () => {
    openMap('korbor-miniapp');
    app();
    act(() => {
      useSnapshotStore.getState().request({ kind: 'agent', requestId: 'r', note: null });
      useSnapshotStore.getState().accept();
    });
    await waitFor(() => expect(phase()).toBe('selecting'));
    act(() => useAppStore.getState().clearMap());
    expect(phase()).toBe('idle');
  });

  test('выбор компонента: элемент выбран — снимок в черновик, экран черновика выбран', async () => {
    const doc = openMap('korbor-miniapp');
    const page = doc.nodes.find((n) => n.kind === 'page');
    const r = app();
    key('KeyC');
    await waitFor(() => expect(within(r.container).getByTestId('pick-hint')).toBeTruthy());
    const anchor = anchorPage(page?.id ?? '');
    act(() => {
      if (anchor !== null) {
        useCommentsStore.getState().startDraft({ anchor: screenAnchor(anchor), viewRect: { x: 0, y: 0, width: 300, height: 200 }, shot: 'pending' });
      }
      useSnapshotStore.getState().beginCapture({ x: 0, y: 0, width: 300, height: 200 });
    });
    await waitFor(() => expect(useCommentsStore.getState().draft?.shot).toStartWith('data:'));
    expect(useAppStore.getState().selectedPageId).toBe(page?.id ?? null);
    expect(phase()).toBe('idle');
  });
});

describe('мост к агенту', () => {
  test('публикует открытую карту и выбранный экран; адрес из шапки важнее адреса карты', async () => {
    const doc = openMap('korbor-miniapp');
    const page = doc.nodes.find((n) => n.kind === 'page');
    app();
    act(() => {
      useAppStore.getState().setBaseUrlOverride('http://localhost:5999');
      useAppStore.getState().selectPage(page?.id ?? null);
    });
    await waitFor(() => {
      const posts = net.calls.filter((c) => c.url.endsWith('/api/agent-state') && c.method === 'POST');
      const last = JSON.parse(posts.at(-1)?.body ?? '{}');
      expect(last.selectedPage?.id).toBe(page?.id);
      expect(last.selectedPage?.title).toBe(page?.title);
      expect(last.baseUrl).toBe('http://localhost:5999');
      expect(last.pageCount).toBe(doc.nodes.filter((n) => n.kind === 'page').length);
    }, { timeout: 2000 });
  });

  test('без dev-сервера (404) опрос и публикация прекращаются', async () => {
    net.restore();
    net = stubFetch(() => undefined);
    openMap('korbor-miniapp');
    app();
    await waitFor(() => expect(net.calls.some((c) => c.method === 'GET')).toBe(true));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 600));
    });
    expect(net.calls.filter((c) => c.method === 'POST')).toEqual([]);
  });
});
