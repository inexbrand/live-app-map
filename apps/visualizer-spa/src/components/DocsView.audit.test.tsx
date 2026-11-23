/**
 * Документация без повторов (аудит ui-audit, пункт 10): «готово» не пишется у каждой эпохи,
 * чипов с нулём нет, файл эпохи без имени файла и повторного заголовка, 09-bugs — один список,
 * зачёркивание отрисовано. Карта — настоящая korbor-miniapp; dev-сервер документации — подмена fetch.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, render, within } from '@testing-library/react';
import type { DocEpoch, DocsModel } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { DocsView } from './DocsView';

useDom();

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  net = stubFetch((url) => (url.startsWith('/__lam_docs/live') ? jsonResponse({ error: 'каталога нет на этой машине' }, 404) : undefined));
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

/** Эпоха с файлом 09-bugs. */
function bugsEpoch(): DocEpoch {
  const e = docsOf().epochs.find((x) => x.files.some((f) => f.path === `${x.dir}/09-bugs.md`));
  if (e === undefined) {
    throw new Error('нет эпохи с 09-bugs');
  }
  return e;
}

/** Заменить текст файла эпохи. */
function withFileText(e: DocEpoch, path: string, text: string): void {
  const docs = docsOf();
  act(() => useAppStore.getState().setDocs({ ...docs, epochs: docs.epochs.map((x) => (x.id === e.id ? { ...x, files: x.files.map((f) => (f.path === path ? { ...f, text } : f)) } : x)) }));
}

describe('откуда числа документации (26/4 против 29/0)', () => {
  test('пока диск не прочитан — строка «снимок из карты»; после чтения строки нет, числа с диска', async () => {
    openMap('korbor-miniapp');
    const snapshot = docsOf();
    const fromDisk: DocsModel = { ...snapshot, epochs: snapshot.epochs.slice(0, 1).map((e) => ({ ...e, readiness: 'ready', openBugs: [] })) };
    let answer: (r: Response) => void = () => undefined;
    net.restore();
    net = stubFetch((url) => (url.startsWith('/__lam_docs/live') ? new Promise<Response>((done) => { answer = done; }) : undefined));
    const { ui } = view();
    const line = ui.getByTestId('docs-source');
    expect(line.textContent).toBe(`Показан снимок из карты (эпох: ${snapshot.epochs.length}). Читаю документацию с диска…`);
    expect(ui.getAllByTestId('docs-epoch-row')).toHaveLength(snapshot.epochs.length);
    await act(async () => {
      answer(jsonResponse({ docs: fromDisk }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ui.queryByTestId('docs-source')).toBeNull();
    expect(ui.getAllByTestId('docs-epoch-row')).toHaveLength(1);
  });

  test('диск не прочитан — причина и что показано', async () => {
    openMap('korbor-miniapp');
    const n = docsOf().epochs.length;
    const { ui } = view();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(ui.getByTestId('docs-source').textContent).toBe(`Показан снимок из карты (эпох: ${n}). С диска не прочитать: каталога нет на этой машине`);
  });

  test('в графе та же строка', () => {
    openMap('korbor-miniapp');
    act(() => useViewStore.getState().setDocsMode('graph'));
    const { ui } = view();
    expect(ui.getByTestId('docs-source').textContent).toContain('Показан снимок из карты');
  });
});

describe('документация без повторов', () => {
  test('у готовой эпохи пометки нет, у не готовой — «не готово · N»', () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    const ready = docs.epochs.find((e) => e.readiness === 'ready');
    const notReady = docs.epochs.find((e) => e.readiness === 'not-ready');
    const { ui } = view();
    const row = (e: DocEpoch | undefined) => ui.getAllByTestId('docs-epoch-row').find((r) => r.querySelector('.docs-row__name')?.textContent === e?.slug);
    expect(ready).toBeDefined();
    expect(row(ready)?.querySelector('.docs-row__state')).toBeNull();
    if (notReady !== undefined) {
      expect(row(notReady)?.querySelector('.docs-row__state')?.textContent).toBe(`не готово · ${notReady.openBugs.length}`);
    }
    expect(ui.getAllByTestId('docs-epoch-row').some((r) => r.textContent?.includes('готово') === true && r.querySelector('.docs-row__state--open') === null)).toBe(false);
  });

  test('чип «Не готово» с нулём скрыт', () => {
    openMap('korbor-miniapp');
    const docs = docsOf();
    act(() => useAppStore.getState().setDocs({ ...docs, epochs: docs.epochs.map((e) => ({ ...e, readiness: 'ready', openBugs: [] })) }));
    const { ui } = view();
    const chips = within(ui.getByRole('group', { name: 'Готовность эпох' })).getAllByRole('button').map((b) => b.textContent);
    expect(chips.some((c) => c?.startsWith('Не готово') === true)).toBe(false);
  });

  test('файл эпохи: без имени файла и без повторного заголовка, вкладки — подпись файла', () => {
    openMap('korbor-miniapp');
    const e = bugsEpoch();
    const brief = e.files[0];
    if (brief === undefined) {
      throw new Error('у эпохи нет файлов');
    }
    withFileText(e, brief.path, '# Brief\n\nЦель задачи.\n');
    act(() => useViewStore.getState().openDoc(brief.path));
    const { container } = view();
    expect(container.querySelector('.docs-doc__file')).toBeNull();
    const body = container.querySelector('.docs-doc__body');
    expect(body?.querySelector('h1')).toBeNull();
    expect(body?.textContent).toContain('Цель задачи.');
  });

  test('09-bugs: один список «Пункты», текст файла свёрнут, открытые пункты шапки не дублируются, ~~ зачёркнуто', () => {
    openMap('korbor-miniapp');
    const e = bugsEpoch();
    const path = `${e.dir}/09-bugs.md`;
    withFileText(e, path, '# Баги\n\n## Open\n\n- [ ] открытый пункт\n\n## Closed\n\n- [x] ~~/ready отвечал 500~~ починено\n');
    act(() => useViewStore.getState().openDoc(path));
    const { ui, container } = view();
    expect(ui.getByTestId('docs-bug-marks')).toBeTruthy();
    expect(ui.queryByTestId('docs-open-bugs')).toBeNull();
    const raw = container.querySelector('.docs-doc__raw');
    expect(raw?.tagName).toBe('DETAILS');
    expect(raw?.hasAttribute('open')).toBe(false);
    const struck = [...container.querySelectorAll('.docs-bugs__text del')].map((d) => d.textContent);
    expect(struck).toEqual(['/ready отвечал 500']);
    expect(container.querySelector('.docs-bugs__text')?.textContent).not.toContain('~~');
  });
});
