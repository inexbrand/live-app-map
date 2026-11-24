/**
 * Замечания как у пользователя: кнопка шапки со счётчиком «проверьте», лист всех
 * замечаний (группы по этапу, фильтр экрана, поиск, клавиши, переход к экрану),
 * окно у компонента (история, «Принять» / «Не исправлено», отправка, черновик) и
 * метки на экране. Ветки строятся настоящей свёрткой событий; dev-сервер — подмена fetch.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { foldThread, type CommentAnchor, type CommentEvent, type CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { useAppStore } from '../../store/app-store';
import { DRAFTS_KEY, useCommentsStore } from '../../store/comments-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { pickOption } from '../../test/select';
import { CommentMarkers } from './CommentMarkers';
import { CommentPopover } from './CommentPopover';
import { CommentsSheet } from './CommentsSheet';
import { CommentsToolbarButton } from './CommentsToolbarButton';

useDom();

/** Время событий: прошлый год — подпись времени не зависит от минуты прогона. */
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
    // Как у настоящей привязки: имя открытой карты
    mapName: useAppStore.getState().document?.project.name ?? null,
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
function created(a: CommentAnchor, text: string): CommentEvent {
  return { type: 'created', seq: 0, at: NOW, author: 'user', text, anchor: a, shot: null };
}

/** Агент ответил — проверьте; пользователь принял — исправлено; новое на другом экране — ждёт агента. */
function threads(): CommentThread[] {
  const [p1, p2] = pageIds();
  return [
    thread('c1', [
      created(anchor(p1, true), 'Кнопка обрезана'),
      { type: 'reply', seq: 1, at: NOW, author: 'agent', text: 'Поправил ширину', files: ['src/Plans.tsx'], commit: 'abc1234' },
      { type: 'status', seq: 2, at: NOW, author: 'agent', status: 'fixed', note: null },
    ]),
    thread('c2', [
      created(anchor(p1, false), 'Весь экран тёмный'),
      { type: 'reply', seq: 1, at: NOW, author: 'agent', text: 'Сменил тему', files: [], commit: null },
      { type: 'status', seq: 2, at: NOW, author: 'user', status: 'fixed', note: null },
    ]),
    thread('c3', [created(anchor(p2, false), 'Нет кнопки назад')]),
  ];
}

type StatusBody = { readonly status: 'open' | 'fixed'; readonly note: string | null };

function isStatusBody(v: unknown): v is StatusBody {
  return typeof v === 'object' && v !== null && 'status' in v && (v.status === 'open' || v.status === 'fixed');
}

let net: ReturnType<typeof stubFetch>;
let posted: unknown[] = [];
let all: CommentThread[] = [];

/** Событие на «сервере»: дописать в ветку и свернуть заново — как настоящее хранилище. */
function appendStatus(id: string, body: StatusBody): CommentThread | undefined {
  const base = all.find((t) => t.id === id);
  if (base === undefined) {
    return undefined;
  }
  const next = thread(id, [...base.events, { type: 'status', seq: base.events.length, at: NOW, author: 'user', status: body.status, note: body.note }]);
  all = all.map((t) => (t.id === id ? next : t));
  return next;
}

beforeEach(() => {
  resetStores();
  localStorage.clear();
  useCommentsStore.setState({ drafts: new Map() });
  posted = [];
  openMap('korbor-miniapp');
  all = threads();
  net = stubFetch((url, init) => {
    if (url.startsWith('/api/comments?')) {
      return jsonResponse({ comments: all });
    }
    const body: unknown = init?.body === undefined ? null : JSON.parse(String(init.body));
    if (url === '/api/comments' && init?.method === 'POST') {
      posted.push(body);
      if (typeof body === 'object' && body !== null && 'text' in body && body.text === 'сломай сервер') {
        return jsonResponse({ error: 'диск полон' }, 500);
      }
      return jsonResponse({ comment: thread('new', [created(anchor(pageIds()[1], true), 'новое')]) });
    }
    const m = /^\/api\/comments\/([^/]+)\/events$/.exec(url);
    if (m?.[1] !== undefined && isStatusBody(body)) {
      posted.push(body);
      const next = appendStatus(m[1], body);
      return next === undefined ? undefined : jsonResponse({ comment: next });
    }
    return undefined;
  });
});

afterEach(() => {
  net.restore();
  document.body.querySelectorAll('[data-lam-preview-body]').forEach((el) => el.remove());
});

async function loadThreads(): Promise<void> {
  await act(async () => {
    useCommentsStore.getState().setMapName('korbor-miniapp');
    await useCommentsStore.getState().refresh();
  });
}

/** Тела нод на холсте: окно замечания встаёт напротив них. */
function nodeBodies(): void {
  for (const id of pageIds()) {
    const el = document.createElement('div');
    el.setAttribute('data-lam-preview-body', '');
    el.setAttribute('data-page-id', id);
    document.body.append(el);
  }
}

function shell() {
  nodeBodies();
  const r = render(
    <>
      <CommentsToolbarButton />
      <CommentsSheet />
      <CommentPopover />
    </>,
  );
  return within(r.container);
}

/** Ввод как у пользователя: fireEvent.change до React в полях после перерисовок не доходит. */
async function typeInto(el: HTMLElement, text: string): Promise<void> {
  const user = userEvent.setup({ document });
  await user.clear(el);
  await user.type(el, text);
}

type Ui = ReturnType<typeof shell>;

function ids(ui: Ui): (string | undefined)[] {
  return ui.getAllByTestId('sheet-item').map((el) => el.dataset['commentId']);
}

function sheetItem(ui: Ui, id: string): HTMLElement {
  const el = ui.getAllByTestId('sheet-item').find((x) => x.dataset['commentId'] === id);
  if (el === undefined) {
    throw new Error(`нет ${id} в листе`);
  }
  return el;
}

describe('кнопка и лист всех замечаний', () => {
  test('счётчик — сколько проверить; лист: сводка, группы, исправлено свёрнуто', async () => {
    const ui = shell();
    await loadThreads();
    expect(ui.getByTestId('open-comments-count').textContent).toBe('1');
    fireEvent.click(ui.getByTestId('open-comments'));
    const sheet = within(ui.getByTestId('comments-sheet'));
    expect(sheet.getByText('Проверить: 1 · Ждут агента: 1 · Исправлено: 1')).toBeTruthy();
    expect(sheet.getByRole('region', { name: 'Проверьте' }).textContent).toContain('Поправил ширину');
    expect(sheet.getByRole('region', { name: 'Ждут агента' }).textContent).toContain('Нет кнопки назад');
    expect(sheet.queryByRole('region', { name: 'Исправлено' })).toBeNull();
    fireEvent.click(sheet.getByText('Исправлено · 1'));
    expect(sheet.getByRole('region', { name: 'Исправлено' }).textContent).toContain('Весь экран тёмный');
    fireEvent.click(ui.getByTestId('open-comments'));
    expect(ui.queryByTestId('comments-sheet')).toBeNull();
  });

  test('фильтр экрана и поиск по ответу агента', async () => {
    const ui = shell();
    await loadThreads();
    act(() => useCommentsStore.getState().openSheet(null));
    const sheet = within(ui.getByTestId('comments-sheet'));
    expect(sheet.getByLabelText('Экран').textContent).toContain('Все экраны');
    await pickOption(sheet.getByLabelText('Экран'), `Экран ${pageIds()[1]}`);
    expect(ids(ui)).toEqual(['c3']);
    await pickOption(sheet.getByLabelText('Экран'), 'Все экраны');
    await typeInto(sheet.getByLabelText('Поиск по замечаниям'), 'ширину');
    expect(ids(ui)).toEqual(['c1']);
    await typeInto(sheet.getByLabelText('Поиск по замечаниям'), 'нет такого');
    expect(sheet.getByText('Под фильтр ничего не подошло.')).toBeTruthy();
  });

  test('клик по замечанию: лист закрыт, экран в фокусе, окно у компонента с историей', async () => {
    const ui = shell();
    await loadThreads();
    act(() => useCommentsStore.getState().openSheet(null));
    fireEvent.click(within(sheetItem(ui, 'c1')).getByText('Кнопка обрезана'));
    expect(ui.queryByTestId('comments-sheet')).toBeNull();
    expect(useAppStore.getState().selectedPageId).toBe(pageIds()[0]);
    const pop = within(ui.getByTestId('comment-popover'));
    expect(pop.getByText('Кнопка обрезана')).toBeTruthy();
    expect(pop.getByText('Поправил ширину')).toBeTruthy();
  });

  test('«Не исправлено» с причиной — вернуть агенту; «Открыть снова» у исправленного', async () => {
    const ui = shell();
    await loadThreads();
    act(() => useCommentsStore.getState().openSheet(null));
    fireEvent.click(within(sheetItem(ui, 'c1')).getByText('Не исправлено'));
    await typeInto(ui.getByLabelText('Что осталось не так'), 'всё ещё режется на 360');
    fireEvent.click(ui.getByText('Вернуть агенту'));
    await waitFor(() => expect(posted.at(-1)).toMatchObject({ status: 'open', note: 'всё ещё режется на 360' }));
    await waitFor(() => expect(sheetItem(ui, 'c1').closest('section')?.getAttribute('aria-label')).toBe('Ждут агента'));
    expect(ui.queryByTestId('open-comments-count')).toBeNull();
    fireEvent.click(ui.getByText('Исправлено · 1'));
    fireEvent.click(within(sheetItem(ui, 'c2')).getByText('Открыть снова'));
    await waitFor(() => expect(posted.at(-1)).toMatchObject({ status: 'open', note: null }));
  });

  test('клавиши: J — выбрать, A — принять, Enter — открыть, Esc — закрыть', async () => {
    const ui = shell();
    await loadThreads();
    act(() => useCommentsStore.getState().openSheet(null));
    const sheet = ui.getByTestId('comments-sheet');
    fireEvent.keyDown(sheet, { key: 'j' });
    expect(sheetItem(ui, 'c1').className).toContain('comments-sheet__item--active');
    fireEvent.keyDown(sheet, { key: 'a' });
    await waitFor(() => expect(posted.at(-1)).toMatchObject({ status: 'fixed', note: null }));
    await waitFor(() => expect(sheetItem(ui, 'c3')).toBeTruthy());
    fireEvent.keyDown(ui.getByTestId('comments-sheet'), { key: 'j' });
    fireEvent.keyDown(ui.getByTestId('comments-sheet'), { key: 'Enter' });
    expect(useAppStore.getState().selectedPageId).toBe(pageIds()[1]);
    act(() => useCommentsStore.getState().openSheet(null));
    fireEvent.keyDown(ui.getByTestId('comments-sheet'), { key: 'Escape' });
    expect(ui.queryByTestId('comments-sheet')).toBeNull();
  });
});

describe('окно у компонента', () => {
  function openOn(pageId: string, withElement: boolean): void {
    act(() => {
      useAppStore.getState().selectPage(pageId);
      useCommentsStore.getState().openTarget({
        anchor: anchor(pageId, withElement),
        frame: withElement ? { rect: { x: 10, y: 20, width: 120, height: 40 }, pageWidth: 390 } : null,
        shot: null,
      });
    });
  }

  test('Enter отправляет; пустой текст — подсказка; сбой сервера — ошибка', async () => {
    const ui = shell();
    await loadThreads();
    openOn(pageIds()[1], true);
    fireEvent.keyDown(ui.getByLabelText('Что не так'), { key: 'Enter' });
    expect(await ui.findByText('Напишите, что не так — или скажите голосом')).toBeTruthy();
    await typeInto(ui.getByLabelText('Что не так'), 'сломай сервер');
    fireEvent.keyDown(ui.getByLabelText('Что не так'), { key: 'Enter' });
    expect(await ui.findByText('диск полон')).toBeTruthy();
    await typeInto(ui.getByLabelText('Что не так'), 'Цена съехала');
    fireEvent.keyDown(ui.getByLabelText('Что не так'), { key: 'Enter' });
    await waitFor(() => expect(useAppStore.getState().toast).toBe('Замечание отправлено агенту'));
    expect(posted.at(-1)).toMatchObject({ text: 'Цена съехала', anchor: { pageId: pageIds()[1], element: { selector: '#buy' } } });
    expect(localStorage.getItem(DRAFTS_KEY) ?? '[]').not.toContain('Цена съехала');
  });

  test('Esc: окно закрыто, текст — черновик в localStorage и в листе; клик по черновику — окно с текстом', async () => {
    const ui = shell();
    await loadThreads();
    openOn(pageIds()[1], true);
    await typeInto(ui.getByLabelText('Что не так'), 'Не тот цвет');
    fireEvent.keyDown(ui.getByLabelText('Что не так'), { key: 'Escape' });
    expect(ui.queryByTestId('comment-popover')).toBeNull();
    expect(useAppStore.getState().toast).toBe('Черновик сохранён');
    expect(localStorage.getItem(DRAFTS_KEY)).toContain('Не тот цвет');
    act(() => useCommentsStore.getState().openSheet(null));
    fireEvent.click(ui.getByTestId('sheet-draft'));
    expect(ui.getByLabelText('Что не так')).toHaveProperty('value', 'Не тот цвет');
  });

  test('больше двух замечаний к компоненту — строка «Замечаний к компоненту: N, проверить: M», раскрывается', async () => {
    const [p1] = pageIds();
    all = [...all, thread('c4', [created(anchor(p1, true), 'Ещё одно')]), thread('c5', [created(anchor(p1, true), 'И ещё')])];
    const ui = shell();
    await loadThreads();
    openOn(p1, true);
    fireEvent.click(ui.getByText('Замечаний к компоненту: 3, проверить: 1'));
    expect(within(ui.getByTestId('comment-history')).getAllByTestId('comment-thread')).toHaveLength(3);
  });

  test('лист открыт — окно закрыто, текст остаётся черновиком', async () => {
    const ui = shell();
    await loadThreads();
    openOn(pageIds()[1], true);
    await typeInto(ui.getByLabelText('Что не так'), 'Съехала цена');
    act(() => useCommentsStore.getState().openSheet(null));
    expect(ui.queryByTestId('comment-popover')).toBeNull();
    expect(ui.getByTestId('sheet-draft').textContent).toContain('Съехала цена');
  });

  test('другой экран в фокусе — окно закрывается', async () => {
    const ui = shell();
    await loadThreads();
    openOn(pageIds()[0], false);
    expect(ui.getByTestId('comment-popover')).toBeTruthy();
    act(() => useAppStore.getState().selectPage(pageIds()[1]));
    expect(ui.queryByTestId('comment-popover')).toBeNull();
  });
});

describe('метки на экране', () => {
  test('метка по этапу; клик — экран в фокусе и окно у элемента', async () => {
    const [p1] = pageIds();
    nodeBodies();
    const r = render(
      <>
        <CommentMarkers nodeId={p1} scaleX={0.5} scaleY={0.5} />
        <CommentPopover />
      </>,
    );
    const ui = within(r.container);
    await loadThreads();
    const mark = ui.getByTestId('comment-marker');
    expect(mark.dataset['kind']).toBe('review');
    expect(mark.style.left).toBe('5px');
    fireEvent.click(mark);
    expect(useAppStore.getState().selectedPageId).toBe(p1);
    expect(within(ui.getByTestId('comment-popover')).getByText('Кнопка обрезана')).toBeTruthy();
  });
});
