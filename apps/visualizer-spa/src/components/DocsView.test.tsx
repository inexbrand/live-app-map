/**
 * Вид «Документация» как у пользователя: список эпох, заметок и руководств, поиск, фильтр
 * готовности, документ эпохи (вкладки, открытые пункты, отметки 09-bugs, скриншоты),
 * ссылки markdown в карту и между документами, локальный граф.
 * Карта — настоящая korbor-miniapp; dev-сервер документации — подмена fetch.
 */
import { dumpDom, useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocEpoch, DocsModel } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useViewStore } from '../store/view-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { DocsView } from './DocsView';

useDom();

let net: ReturnType<typeof stubFetch>;
let liveDocs: DocsModel | null = null;

beforeEach(() => {
  resetStores();
  liveDocs = null;
  net = stubFetch((url, init) => {
    if (url.startsWith('/__lam_docs/live')) {
      return liveDocs === null ? jsonResponse({ error: 'каталога нет на этой машине' }, 404) : jsonResponse({ docs: liveDocs });
    }
    if (url === '/__lam_docs/bug') {
      const body: unknown = JSON.parse(String(init?.body));
      const docs = useAppStore.getState().document?.docs;
      const epoch = docs?.epochs.find((e) => typeof body === 'object' && body !== null && 'path' in body && String(body.path).startsWith(e.dir));
      return epoch === undefined ? jsonResponse({ error: 'нет эпохи' }, 400) : jsonResponse({ epoch: { ...epoch, readiness: 'ready' } });
    }
    return undefined;
  });
});

afterEach(() => net.restore());

function view() {
  const r = render(<DocsView />);
  return { ui: within(r.container), container: r.container };
}

function docsOf(): DocsModel {
  const docs = useAppStore.getState().document?.docs;
  if (docs === undefined) {
    throw new Error('нет docs');
  }
  return docs;
}

function epochWhere(cond: (e: DocEpoch) => boolean): DocEpoch {
  const hit = docsOf().epochs.find(cond);
  if (hit === undefined) {
    throw new Error('нет подходящей эпохи');
  }
  return hit;
}

describe('вид «Документация»', () => {
  test('без документации: подсказка про --code-dir', () => {
    const { ui, container } = view();
    expect(ui.getByTestId('docs-view').textContent).toContain('В карте нет документации.');
    dumpDom('docs-empty', container);
  });

  test('список и первая эпоха; документация с диска недоступна — отметки выключены', async () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const { ui, container } = view();
    expect(ui.getAllByTestId('docs-epoch-row')).toHaveLength(docs.epochs.length);
    expect(ui.getByTestId('docs-epoch-head')).toBeTruthy();
    await waitFor(() => expect(net.calls.some((c) => c.url.startsWith('/__lam_docs/live'))).toBe(true));
    dumpDom('docs-first', container);
    const notReady = docs.epochs.filter((e) => e.readiness === 'not-ready').length;
    expect(ui.getByRole('button', { name: `Не готово ${notReady}` })).toBeTruthy();
  });

  test('фильтр готовности и поиск по тексту; совпадение открывает документ', async () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const { ui, container } = view();
    fireEvent.click(ui.getByRole('button', { name: 'Готово' }));
    expect(ui.queryAllByTestId('docs-epoch-row')).toHaveLength(docs.epochs.filter((e) => e.readiness === 'ready').length);
    fireEvent.click(ui.getByRole('button', { name: 'Все' }));
    const word = docs.epochs[0]?.slug.split('-')[0] ?? 'epoch';
    await userEvent.setup({ document }).type(ui.getByLabelText('Поиск по документации'), word);
    const hits = ui.queryAllByTestId('docs-hit');
    dumpDom('docs-search', container);
    if (hits[0] !== undefined) {
      fireEvent.click(hits[0]);
      expect(useViewStore.getState().doc).not.toBeNull();
    }
    await userEvent.setup({ document }).type(ui.getByLabelText('Поиск по документации'), 'zzzнет-такого');
    expect(ui.getByText('Ничего не найдено.')).toBeTruthy();
  });

  test('эпоха: вкладки файлов, открытые пункты с «ещё», 09-bugs с отметкой', async () => {
    openMap('korbor-miniapp');
    liveDocs = docsOf();
    const e = epochWhere((x) => x.openBugs.length > 5 && x.files.some((f) => f.path === `${x.dir}/09-bugs.md`));
    act(() => useViewStore.getState().openDoc(e.dir));
    const { ui, container } = view();
    const bugs = within(ui.getByTestId('docs-open-bugs'));
    fireEvent.click(bugs.getByRole('button', { name: `ещё ${e.openBugs.length - 5}` }));
    expect(bugs.queryByRole('button', { name: /^ещё/ })).toBeNull();
    const tabs = within(ui.getByRole('navigation', { name: 'Файлы эпохи' })).getAllByRole('button');
    expect(tabs).toHaveLength(e.files.length);
    const bugsTab = tabs.find((t) => t.getAttribute('title') === '09-bugs.md');
    if (bugsTab === undefined) {
      throw new Error('нет вкладки 09-bugs');
    }
    fireEvent.click(bugsTab);
    expect(useViewStore.getState().doc).toBe(`${e.dir}/09-bugs.md`);
    await waitFor(() => expect(ui.getByText(/^Отметка правит файл на диске/)).toBeTruthy());
    dumpDom('docs-bugs', container);
    const item = ui.getAllByTestId('docs-bug-item').find((li) => li.getAttribute('data-state') === 'open');
    if (item === undefined) {
      throw new Error('нет открытого пункта');
    }
    fireEvent.click(within(item).getByRole('button', { name: 'Закрыть' }));
    expect(within(item).getByTestId('docs-bug-confirm').textContent).toContain('пункт станет закрытым');
    fireEvent.click(within(item).getByRole('button', { name: 'Отмена' }));
    expect(within(item).queryByTestId('docs-bug-confirm')).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Записать' }));
    await waitFor(() => expect(useAppStore.getState().document?.docs?.epochs.find((x) => x.id === e.id)?.readiness).toBe('ready'));
    expect(JSON.parse(net.calls.find((c) => c.url === '/__lam_docs/bug')?.body ?? '{}')).toMatchObject({ path: `${e.dir}/09-bugs.md`, state: 'closed' });
  });

  test('отметка не записалась: ошибка в подтверждении', async () => {
    openMap('korbor-miniapp');
    liveDocs = docsOf();
    const e = epochWhere((x) => x.files.some((f) => f.path === `${x.dir}/09-bugs.md` && /^\s*- /m.test(f.text)));
    act(() => useViewStore.getState().openDoc(`${e.dir}/09-bugs.md`));
    net.restore();
    net = stubFetch((url) => (url.startsWith('/__lam_docs/live') ? jsonResponse({ docs: liveDocs }) : jsonResponse({ error: 'файл занят' }, 409)));
    const { ui } = view();
    await waitFor(() => expect(ui.getByText(/^Отметка правит файл на диске/)).toBeTruthy());
    const item = ui.getAllByTestId('docs-bug-item')[0];
    if (item === undefined) {
      throw new Error('нет пунктов');
    }
    fireEvent.click(within(item).getAllByRole('button')[0] ?? item);
    fireEvent.click(within(item).getByRole('button', { name: 'Записать' }));
    await waitFor(() => expect(within(item).getByRole('alert').textContent).toBe('файл занят'));
  });

  test('заметка и руководство: шапка файла; неизвестный документ — подсказка', () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const note = docs.notes[0] ?? docs.guides[0];
    if (note === undefined) {
      throw new Error('нет заметок');
    }
    act(() => useViewStore.getState().openDoc(note.path));
    const { ui, container } = view();
    expect(within(ui.getByTestId('docs-doc')).getByRole('heading', { level: 2 }).textContent).toBe(note.title);
    dumpDom('docs-note', container);
    act(() => useViewStore.getState().openDoc('docs/нет-такого.md'));
    expect(ui.getByRole('status').textContent).toBe('Документа «docs/нет-такого.md» нет в карте: его удалили или карта снята раньше. Выберите документ слева.');
  });

  test('пустая документация: ни эпох, ни файлов', () => {
    openMap('korbor-miniapp');
    act(() => useAppStore.getState().setDocs({ ...docsOf(), epochs: [], notes: [], guides: [] }));
    const { ui, container } = view();
    expect(ui.getByText('В проекте нет docs/epoch.')).toBeTruthy();
    expect(ui.getByRole('status').textContent).toBe('Выберите документ слева.');
    dumpDom('docs-none', container);
  });

  test('скриншоты эпохи: сетка и просмотр во весь экран', () => {
    openMap('korbor-miniapp');
    const e = docsOf().epochs.find((x) => x.images.length > 0);
    if (e === undefined) {
      return;
    }
    act(() => useViewStore.getState().openDoc(e.dir));
    const { ui, container } = view();
    const gallery = ui.queryByTestId('docs-gallery');
    if (gallery === null) {
      return;
    }
    dumpDom('docs-gallery', container);
    const first = within(gallery).getAllByRole('button')[0];
    if (first === undefined) {
      throw new Error('пустая галерея');
    }
    fireEvent.click(first);
    const zoom = container.querySelector('.docs-zoom');
    expect(zoom).not.toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Закрыть' }));
    expect(container.querySelector('.docs-zoom')).toBeNull();
  });

  test('переключатель режима и копирование ссылки', async () => {
    openMap('korbor-miniapp');
    const { ui } = view();
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied.push(t); } } });
    fireEvent.click(ui.getByRole('button', { name: 'Ссылка' }));
    await waitFor(() => expect(ui.getByRole('button', { name: 'Скопировано' })).toBeTruthy());
    expect(copied).toEqual([window.location.href]);
    fireEvent.click(ui.getByRole('button', { name: 'Текст' }));
    expect(useViewStore.getState().docsMode).toBe('text');
  });

  test('пустой файл эпохи: «Файл пуст»', () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const e = docs.epochs[0];
    const f = e?.files[0];
    if (e === undefined || f === undefined) {
      throw new Error('нет файлов');
    }
    act(() => {
      useAppStore.getState().setDocs({ ...docs, epochs: docs.epochs.map((x) => (x.id === e.id ? { ...x, files: x.files.map((y) => (y.path === f.path ? { ...y, text: '  ' } : y)) } : x)) });
      useViewStore.getState().openDoc(f.path);
    });
    const { ui } = view();
    expect(ui.getByText('Файл пуст — в нём ещё ничего не записано.')).toBeTruthy();
  });
});

describe('markdown документа', () => {
  /** Открыть заметку с заданным текстом. */
  function noteWith(text: string): void {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const path = 'docs/agent-notes/test-note.md';
    act(() => {
      useAppStore.getState().setDocs({ ...docs, notes: [...docs.notes, { path, title: 'Проверка', text }] });
      useViewStore.getState().openDoc(path);
    });
  }

  test('код-ссылки: документ раздела, роут карты, файл, блок кода', () => {
    const docs = (() => { openMap('korbor-miniapp'); return docsOf(); })();
    const target = docs.notes[0]?.path ?? docs.guides[0]?.path ?? '';
    const route = useAppStore.getState().document?.code?.routes[0];
    noteWith(`См. \`${target}\` и \`${route?.method} ${route?.path}\`, \`просто-код\`.\n\n\`\`\`ts\nconst a = 1;\n\`\`\`\n`);
    const { ui, container } = view();
    const md = within(ui.getAllByTestId('doc-markdown')[0] ?? container);
    dumpDom('md-code', container);
    expect(container.querySelector('pre code.language-ts')).not.toBeNull();
    fireEvent.click(md.getByTestId('doc-ref-doc'));
    expect(useViewStore.getState().doc).toBe(target);
  });

  test('ссылки: внешняя, документ, место карты, мёртвая; картинки', () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const target = docs.notes[0]?.path ?? '';
    const table = useAppStore.getState().document?.code?.tables[0];
    noteWith(`[сайт](https://example.com) [заметка](/${target}) [нет](./нет.md) [таблица](${table?.location.file ?? 'x.ts'}) [пусто]()\n\n![схема](./img/a.png) ![вне](https://e.com/x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n`);
    const { container } = view();
    dumpDom('md-links', container);
    const md = container.querySelector('[data-testid="doc-markdown"]');
    expect(md?.querySelector('a[href="https://example.com"]')?.getAttribute('target')).toBe('_blank');
    expect(md?.querySelector('.md__dead')).not.toBeNull();
    expect(md?.querySelector('.md__table table')).not.toBeNull();
    expect(md?.querySelector('img.md__img')).not.toBeNull();
    const link = Array.from(md?.querySelectorAll('button.md__link') ?? []).find((b) => b.textContent === 'заметка');
    if (link instanceof HTMLElement) {
      fireEvent.click(link);
      expect(useViewStore.getState().doc).toBe(target);
    }
  });
});

describe('локальный граф', () => {
  test('глубина, общий граф, списки связей', () => {
    openMap('korbor-miniapp');
    const e = docsOf().epochs[0];
    if (e === undefined) {
      throw new Error('нет эпох');
    }
    act(() => useViewStore.getState().openDoc(e.dir));
    const { ui, container } = view();
    const local = within(ui.getByTestId('local-graph'));
    fireEvent.click(local.getByRole('button', { name: '2 шага' }));
    expect(useDocGraphStore.getState().localDepth).toBe(2);
    fireEvent.click(local.getByRole('button', { name: '1 шаг' }));
    expect(useDocGraphStore.getState().localDepth).toBe(1);
    dumpDom('docs-local-graph', ui.getByTestId('local-graph'));
    const out = ui.queryByTestId('local-graph-out') ?? ui.queryByTestId('local-graph-in');
    const btn = out?.querySelector('button:not([disabled])');
    if (btn instanceof HTMLElement) {
      fireEvent.click(btn);
    }
    expect(container).toBeTruthy();
    act(() => useViewStore.getState().openDoc(e.dir));
    fireEvent.click(within(ui.getByTestId('local-graph')).getByRole('button', { name: 'Открыть в общем графе' }));
    expect(useViewStore.getState().docsMode).toBe('graph');
    expect(useDocGraphStore.getState().selected).not.toBeNull();
  });
});
