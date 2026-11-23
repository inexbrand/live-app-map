/**
 * Замечания как у пользователя: кнопка шапки, общий список с фильтрами и переходом,
 * ветки экрана (где, снимок, ответы ИИ, смена статуса, текст для агента), поле
 * нового замечания (текст, Enter, Esc, ⌥ — голос) и запуск выбора компонента.
 * Ветки строятся настоящей свёрткой событий; dev-сервер замечаний — подмена fetch.
 */
import { dumpDom, useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { foldThread, type CommentAnchor, type CommentEvent, type CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { NODE_IFRAME_ATTR } from '../../lib/gateway/use-gateway-frames';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { useSnapshotStore } from '../../store/snapshot-store';
import { useViewStore } from '../../store/view-store';
import { useVoiceStore } from '../../store/voice-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { CommentComposer } from './CommentComposer';
import { CommentsListPanel } from './CommentsListPanel';
import { CommentsToolbarButton } from './CommentsToolbarButton';
import { ScreenCommentsPanel } from './ScreenCommentsPanel';
import { startComment } from './start-comment';
import { pickOption } from '../../test/select';

useDom();

/** Время событий: прошлый год — подпись «давно» не зависит от минуты прогона. */
const NOW = '2025-03-01T10:00:00.000Z';

function pageIds(): [string, string] {
  const pages = useAppStore.getState().document?.nodes.filter((n) => n.kind === 'page') ?? [];
  const [a, b] = pages;
  if (a === undefined || b === undefined) {
    throw new Error('нет экранов');
  }
  return [a.id, b.id];
}

function anchor(pageId: string, withElement: boolean): CommentAnchor {
  return {
    mapName: 'korbor-miniapp',
    pageId,
    pageTitle: `Экран ${pageId}`,
    pageUrl: null,
    role: null,
    element: withElement
      ? {
          selector: '#buy',
          domPath: 'main > button#buy',
          tag: 'button',
          text: 'Купить подписку на полгода со скидкой для новых пользователей сервиса',
          rect: { x: 10, y: 20, width: 120, height: 40 },
          viewport: { width: 390, height: 844 },
          component: { name: 'BuyButton', chain: ['BuyButton', 'Plans'], source: { file: 'src/Plans.tsx', line: 42, origin: 'code-map' } },
        }
      : null,
  };
}

function thread(id: string, events: CommentEvent[]): CommentThread {
  const t = foldThread(id, events);
  if (t === null) {
    throw new Error('нет created');
  }
  return t;
}

function created(a: CommentAnchor, text: string, author: 'user' | 'agent' = 'user', shot: string | null = null): CommentEvent {
  return { type: 'created', seq: 0, at: NOW, author, text, anchor: a, shot };
}

/** Три ветки: открытая с ответом ИИ на компонент, исправленная от ИИ без элемента, открытая на другом экране. */
function threads(): CommentThread[] {
  const [p1, p2] = pageIds();
  return [
    thread('c1', [
      created(anchor(p1, true), 'Кнопка обрезана', 'user', 'shot.png'),
      { type: 'reply', seq: 1, at: NOW, author: 'agent', text: 'Поправил ширину', files: ['src/Plans.tsx'], commit: 'abc1234' },
      { type: 'status', seq: 2, at: NOW, author: 'agent', status: 'fixed', note: 'проверено' },
      { type: 'status', seq: 3, at: NOW, author: 'user', status: 'open', note: null },
    ]),
    thread('c2', [created(anchor(p1, false), 'Весь экран тёмный', 'agent'), { type: 'status', seq: 1, at: NOW, author: 'agent', status: 'fixed', note: null }]),
    thread('c3', [created(anchor(p2, false), 'Нет кнопки назад')]),
  ];
}

let net: ReturnType<typeof stubFetch>;
let posted: unknown[] = [];

beforeEach(() => {
  resetStores();
  posted = [];
  openMap('korbor-miniapp');
  const all = threads();
  net = stubFetch((url, init) => {
    if (url.startsWith('/api/comments?')) {
      return jsonResponse({ comments: all });
    }
    if (url === '/api/comments' && init?.method === 'POST') {
      const body: unknown = JSON.parse(String(init.body));
      posted.push(body);
      if (typeof body === 'object' && body !== null && 'text' in body && body.text === 'сломай сервер') {
        return jsonResponse({ error: 'диск полон' }, 500);
      }
      const t = thread('new', [created(anchor(pageIds()[0], true), 'новое')]);
      return jsonResponse({ comment: t });
    }
    const m = /^\/api\/comments\/([^/]+)\/events$/.exec(url);
    if (m !== null) {
      const body: unknown = JSON.parse(String(init?.body));
      posted.push(body);
      const base = all.find((t) => t.id === m[1]);
      const status = typeof body === 'object' && body !== null && 'status' in body && body.status === 'fixed' ? 'fixed' : 'open';
      return base === undefined ? undefined : jsonResponse({ comment: { ...base, status } });
    }
    return undefined;
  });
});

afterEach(() => net.restore());

async function loadThreads(): Promise<void> {
  await act(async () => {
    useCommentsStore.getState().setMapName('korbor-miniapp');
    await useCommentsStore.getState().refresh();
  });
}

function shell() {
  const r = render(
    <>
      <CommentsToolbarButton />
      <CommentsListPanel />
      <ScreenCommentsPanel />
      <CommentComposer />
    </>,
  );
  return { ui: within(r.container), container: r.container };
}

describe('кнопка и общий список', () => {
  test('кнопка показывает открытые и открывает список; фильтры статуса, автора, текста', async () => {
    const { ui, container } = shell();
    expect(ui.getByTestId('open-comments').getAttribute('aria-label')).toBe('Замечания');
    await loadThreads();
    expect(ui.getByTestId('open-comments-count').textContent).toBe('2');
    fireEvent.click(ui.getByTestId('open-comments'));
    const list = within(ui.getByTestId('comments-list'));
    expect(list.getByText('Открыто 2 из 3')).toBeTruthy();
    expect(list.getAllByTestId('comments-list-item').map((b) => b.getAttribute('data-comment-id'))).toEqual(['c1', 'c3']);
    expect(list.getAllByTestId('comments-list-item')[0]?.textContent).toContain('Ответ ИИ: Поправил ширину');
    dumpDom('comments-list', container);
    fireEvent.click(list.getByRole('button', { name: 'Исправленные' }));
    expect(list.getAllByTestId('comments-list-item').map((b) => b.getAttribute('data-comment-id'))).toEqual(['c2']);
    fireEvent.click(list.getByRole('button', { name: 'Все' }));
    await pickOption(list.getByRole('combobox', { name: 'Автор' }), 'От ИИ');
    expect(list.getAllByTestId('comments-list-item').map((b) => b.getAttribute('data-comment-id'))).toEqual(['c2']);
    await pickOption(list.getByRole('combobox', { name: 'Автор' }), 'Мои');
    expect(list.getAllByTestId('comments-list-item')).toHaveLength(2);
    await userEvent.setup({ document }).type(list.getByLabelText('Поиск по замечаниям'), 'buybutton');
    expect(list.getAllByTestId('comments-list-item').map((b) => b.getAttribute('data-comment-id'))).toEqual(['c1']);
    await userEvent.setup({ document }).type(list.getByLabelText('Поиск по замечаниям'), 'zzz');
    expect(list.getByText('Под фильтр ничего не подошло.')).toBeTruthy();
    await pickOption(list.getByRole('combobox', { name: 'Автор' }), 'Все авторы');
    fireEvent.click(list.getByRole('button', { name: 'Закрыть' }));
    expect(ui.queryByTestId('comments-list')).toBeNull();
  });

  test('без замечаний — подсказка', () => {
    const { ui } = shell();
    act(() => useCommentsStore.getState().setListOpen(true));
    expect(ui.getByText('Замечаний пока нет. Выберите экран и нажмите C.')).toBeTruthy();
  });

  test('клик по замечанию: экран, фокус, список закрыт, рамка в живом экране', async () => {
    const { ui } = shell();
    await loadThreads();
    act(() => useViewStore.getState().setView('api'));
    act(() => useCommentsStore.getState().setListOpen(true));
    const [p1] = pageIds();
    const frame = document.createElement('iframe');
    frame.setAttribute(NODE_IFRAME_ATTR, p1);
    document.body.append(frame);
    const sent: unknown[] = [];
    // Живой экран в тесте — окно, которое записывает сообщения визуализатора.
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (data: unknown) => sent.push(data) } });
    fireEvent.click(within(ui.getByTestId('comments-list')).getAllByTestId('comments-list-item')[0] ?? document.body);
    expect(useViewStore.getState().view).toBe('screens');
    expect(useAppStore.getState().selectedPageId).toBe(p1);
    expect(useCommentsStore.getState().focusId).toBe('c1');
    expect(ui.queryByTestId('comments-list')).toBeNull();
    await waitFor(() => expect(sent).toContainEqual({ lam: 'flash', selector: '#buy' }), { timeout: 2000 });
  });
});

describe('ветки экрана', () => {
  test('ветки выбранного экрана: где, снимок, ответ ИИ, события; статус и текст для агента', async () => {
    const { ui, container } = shell();
    await loadThreads();
    const [p1] = pageIds();
    act(() => useAppStore.getState().selectPage(p1));
    const panel = within(ui.getByTestId('screen-comments'));
    expect(panel.getAllByTestId('comment-thread').map((t) => t.getAttribute('data-comment-id'))).toEqual(['c1', 'c2']);
    const c1 = within(panel.getAllByTestId('comment-thread')[0] ?? container);
    expect(c1.getByText('BuyButton')).toBeTruthy();
    expect(c1.getByText('src/Plans.tsx:42')).toBeTruthy();
    expect(c1.getByRole('img').getAttribute('src')).toBe('/api/comments/c1/shot.png');
    expect(c1.getByTestId('comment-reply').textContent).toContain('abc1234');
    expect(c1.getAllByTestId('comment-event').map((e) => e.textContent?.split(' · ')[0])).toEqual(['ИИ отметил «исправлено»: проверено', 'Вы открыл снова']);
    expect(within(panel.getAllByTestId('comment-thread')[1] ?? container).getByText('Экран целиком')).toBeTruthy();
    dumpDom('comments-screen', container);
    fireEvent.click(c1.getByRole('button', { name: 'Исправлено' }));
    await waitFor(() => expect(useCommentsStore.getState().threads.find((t) => t.id === 'c1')?.status).toBe('fixed'));
    expect(posted).toContainEqual({ type: 'status', status: 'fixed', note: null });
    fireEvent.click(within(panel.getAllByTestId('comment-thread')[1] ?? container).getByRole('button', { name: 'Открыть снова' }));
    await waitFor(() => expect(useCommentsStore.getState().threads.find((t) => t.id === 'c2')?.status).toBe('open'));
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied.push(t); } } });
    fireEvent.click(c1.getByRole('button', { name: 'Для агента' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Замечание скопировано — вставьте агенту'));
    expect(copied[0]).toContain('c1');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('нет'); } } });
    fireEvent.click(c1.getByRole('button', { name: 'Для агента' }));
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Не удалось скопировать в буфер'));
    fireEvent.click(c1.getByRole('button', { name: 'Показать' }));
    act(() => useCommentsStore.getState().setListOpen(true));
    expect(ui.queryByTestId('screen-comments')).toBeNull();
  });
});

describe('новое замечание', () => {
  function draft(withElement: boolean, shot: 'pending' | string | null = null): void {
    act(() => useCommentsStore.getState().startDraft({ anchor: anchor(pageIds()[0], withElement), viewRect: { x: 100, y: 100, width: 50, height: 30 }, shot }));
  }

  test('пока снимок снимается — поля нет; потом — что выбрано и снимок', () => {
    const { ui, container } = shell();
    draft(true, 'pending');
    expect(ui.queryByTestId('comment-composer')).toBeNull();
    act(() => useCommentsStore.getState().setDraftShot('data:image/png;base64,AAA'));
    const box = within(ui.getByTestId('comment-composer'));
    expect(box.getByText('BuyButton')).toBeTruthy();
    expect(box.getByText('src/Plans.tsx:42')).toBeTruthy();
    expect(box.getByTestId('comment-shot').getAttribute('src')).toBe('data:image/png;base64,AAA');
    dumpDom('composer-element', container);
    act(() => useCommentsStore.getState().closeDraft());
    draft(false);
    expect(within(ui.getByTestId('comment-composer')).getByText('Экран целиком')).toBeTruthy();
    dumpDom('composer-screen', container);
  });

  test('Enter сохраняет; пустой текст и ошибка сервера — сообщение; Esc закрывает', async () => {
    const { ui } = shell();
    draft(true);
    const text = within(ui.getByTestId('comment-composer')).getByLabelText('Что не так');
    fireEvent.keyDown(text, { key: 'Enter' });
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('Напишите, что не так — или скажите голосом'));
    const user = userEvent.setup({ document });
    await user.type(text, 'сломай сервер');
    fireEvent.click(within(ui.getByTestId('comment-composer')).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('диск полон'));
    await user.clear(text);
    await user.type(text, 'Текст обрезан');
    fireEvent.keyDown(text, { key: 'Enter', shiftKey: true });
    expect(posted).toHaveLength(1);
    fireEvent.keyDown(text, { key: 'Enter' });
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Замечание сохранено'));
    expect(ui.queryByTestId('comment-composer')).toBeNull();
    expect(useCommentsStore.getState().focusId).toBe('new');
    draft(false);
    fireEvent.keyDown(within(ui.getByTestId('comment-composer')).getByRole('button', { name: 'Закрыть' }), { key: 'Escape' });
    expect(ui.queryByTestId('comment-composer')).toBeNull();
    draft(false);
    fireEvent.keyDown(ui.getByTestId('comment-composer'), { key: 'a' });
    fireEvent.click(within(ui.getByTestId('comment-composer')).getByRole('button', { name: 'Закрыть' }));
    expect(ui.queryByTestId('comment-composer')).toBeNull();
  });

  test('⌥ держать — голос: модели нет — окно модели; ⌥ + клавиша — не голос', async () => {
    const { ui } = shell();
    draft(true);
    const text = within(ui.getByTestId('comment-composer')).getByLabelText('Что не так');
    fireEvent.keyDown(text, { key: 'Alt' });
    fireEvent.keyDown(text, { key: 'k', altKey: true });
    fireEvent.keyUp(text, { key: 'Alt' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(useVoiceStore.getState().dialog).toBe(false);
    fireEvent.keyDown(text, { key: 'Alt' });
    fireEvent.keyDown(text, { key: 'Alt', repeat: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    fireEvent.keyUp(text, { key: 'Alt' });
    fireEvent.keyUp(text, { key: 'x' });
    await waitFor(() => expect(useVoiceStore.getState().dialog).toBe(true));
    fireEvent.click(within(ui.getByTestId('comment-composer')).getByRole('button', { name: 'Модель распознавания' }));
    expect(useVoiceStore.getState().dialog).toBe(true);
  });
});

describe('начать замечание', () => {
  test('без карты — ничего; область без экрана — подсказка; выбор компонента и смена на область', () => {
    act(() => useAppStore.setState({ document: null }));
    startComment('element');
    expect(useSnapshotStore.getState().session.phase).toBe('idle');
    openMap('korbor-miniapp');
    act(() => useViewStore.getState().setView('api'));
    startComment('region');
    expect(useAppStore.getState().toast).toBe('Выберите экран, к которому относится область');
    const [p1, p2] = pageIds();
    startComment('element', p1);
    expect(useAppStore.getState().selectedPageId).toBe(p1);
    expect(useViewStore.getState().view).toBe('screens');
    expect(useSnapshotStore.getState().session).toMatchObject({ purpose: { kind: 'comment', pick: 'element', pageId: p1 } });
    act(() => useSnapshotStore.getState().opened());
    startComment('region', p2);
    expect(useSnapshotStore.getState().session).toMatchObject({ purpose: { kind: 'comment', pick: 'region', pageId: p2 } });
    startComment('element');
    expect(useAppStore.getState().toast).toBe('Снимок уже идёт');
  });
});
