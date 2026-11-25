/**
 * Раскладка вида «База данных» как у пользователя: ER-схема на настоящей карте korbor,
 * выбор таблицы на схеме, вкладка «Схема в коде» и замечание к объявлению.
 * Dev-сервер (исходник, замечания, данные БД) — подмена fetch.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROJECT_SOURCE_PATH } from '../../lib/project/source-contract';
import { useViewStore } from '../../store/view-store';
import { openMap, resetStores, stubFetch } from '../../test/fixtures';
import { DatabaseView } from '../DatabaseView';

useDom();

const SOURCE = "/** Пользователи. */\nexport const users = pgTable('users', {\n  id: uuid('id').primaryKey(),\n});";

let net: ReturnType<typeof stubFetch>;
beforeEach(() => {
  resetStores();
  net = stubFetch((url, init) => {
    const u = new URL(url, 'http://localhost:4310');
    if (u.pathname === PROJECT_SOURCE_PATH) {
      const file = u.searchParams.get('file') ?? '';
      return Response.json({ file, startLine: 7, endLine: 10, text: SOURCE });
    }
    if (u.pathname === '/api/comments' && init?.method === 'POST') {
      return Response.json({ error: 'проверка отправки' }, { status: 400 });
    }
    if (u.pathname === '/api/comments') {
      return Response.json({ comments: [] });
    }
    if (u.pathname === '/__lam_db/status') {
      return Response.json({ state: 'ready', host: 'localhost', database: 'korbor', writable: true });
    }
    if (u.pathname === '/__lam_db/rows') {
      return Response.json({
        table: u.searchParams.get('table'),
        columns: [
          { name: 'id', type: 'int4', nullable: false, hasDefault: true },
          { name: 'name', type: 'text', nullable: true, hasDefault: false },
        ],
        primaryKey: ['id'],
        rows: [{ id: '1', name: 'Аня' }],
        total: 1,
        page: 0,
        size: 50,
      });
    }
    return undefined;
  });
});
afterEach(() => net.restore());

describe('раскладка «База данных»', () => {
  test('ER-схема: карточка на каждую таблицу, три перетаскиваемые границы', () => {
    const doc = openMap('korbor-miniapp');
    const r = render(<DatabaseView />);
    const ui = within(r.container);
    expect(ui.getAllByTestId('erd-table')).toHaveLength(doc.code?.tables.length ?? -1);
    expect(r.container.querySelectorAll('[data-slot="resizable-handle"]')).toHaveLength(3);
  });

  test('клик по карточке на схеме выбирает таблицу: справа её документация', () => {
    const doc = openMap('korbor-miniapp');
    const target = doc.code?.tables[3];
    if (target === undefined) {
      throw new Error('мало таблиц в карте');
    }
    const r = render(<DatabaseView />);
    const card = r.container.querySelector(`[data-table="${target.exportName}"]`);
    if (card === null) {
      throw new Error('нет карточки таблицы');
    }
    act(() => {
      fireEvent.click(card);
    });
    expect(useViewStore.getState().table).toBe(target.exportName);
    expect(within(r.container).getByTestId('db-table').querySelector('h2')?.textContent).toBe(target.name);
  });

  test('«Схема в коде»: объявление с номерами строк, замечание уходит с привязкой к коду', async () => {
    const doc = openMap('korbor-miniapp');
    const table = doc.code?.tables[0];
    if (table === undefined) {
      throw new Error('нет таблиц');
    }
    act(() => useViewStore.getState().openTable(table.exportName));
    const r = render(<DatabaseView />);
    const ui = within(r.container);
    const user = userEvent.setup({ document });
    await user.click(ui.getByRole('tab', { name: 'Схема в коде' }));
    const code = await waitFor(() => ui.getByTestId('db-code'));
    expect(code.textContent).toContain("export const users = pgTable('users', {");
    expect(code.querySelector('.db-code__no')?.textContent).toBe('7');
    // Поле замечания внизу панели не забирает фокус: иначе панель прокручивается мимо кода
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');
    expect(net.calls.some((c) => c.url.includes(`file=${encodeURIComponent(table.location.file)}`) && c.url.includes(`line=${table.location.line}`))).toBe(true);

    await user.type(within(ui.getByTestId('db-code-comment')).getByRole('textbox'), 'Добавь индекс на email');
    await user.click(within(ui.getByTestId('db-code-comment')).getByRole('button', { name: 'Отправить' }));
    const post = await waitFor(() => {
      const c = net.calls.find((x) => x.method === 'POST' && x.url.includes('/api/comments'));
      if (c === undefined) {
        throw new Error('замечание не отправлено');
      }
      return c;
    });
    const body: unknown = JSON.parse(post.body ?? 'null');
    expect(body).toMatchObject({
      text: 'Добавь индекс на email',
      anchor: { pageId: `db:${table.exportName}`, element: null, code: { kind: 'table', name: table.exportName, file: table.location.file, line: 7, endLine: 10 } },
    });
    // Ошибка сервера видна под полем, текст не теряется
    await waitFor(() => expect(ui.getByTestId('db-code-comment').textContent).toContain('проверка отправки'));
  });

  test('несохранённые правки: смена таблицы спрашивает подтверждение, отказ оставляет таблицу', async () => {
    const doc = openMap('korbor-miniapp');
    const [first, second] = doc.code?.tables ?? [];
    if (first === undefined || second === undefined) {
      throw new Error('мало таблиц');
    }
    act(() => useViewStore.getState().openTable(first.exportName));
    const r = render(<DatabaseView />);
    const ui = within(r.container);
    const user = userEvent.setup({ document });
    const td = await waitFor(() => {
      const el = r.container.querySelector('td[data-column="name"]');
      if (!(el instanceof HTMLElement)) {
        throw new Error('нет ячейки');
      }
      return el;
    });
    fireEvent.doubleClick(td);
    const input = ui.getByLabelText('Значение name');
    await user.clear(input);
    await user.type(input, 'Боря{Enter}');
    const asked: string[] = [];
    const original = window.confirm;
    let answer = false;
    window.confirm = (text?: string): boolean => {
      asked.push(text ?? '');
      return answer;
    };
    try {
      const rowOf = (name: string) => [...r.container.querySelectorAll('.db-view__row')].find((b) => b.querySelector('.db-view__name')?.textContent === name);
      const target = rowOf(second.name);
      if (!(target instanceof HTMLElement)) {
        throw new Error('нет строки второй таблицы');
      }
      await user.click(target);
      expect(asked).toEqual(['Несохранённых правок: 1. Отбросить их?']);
      expect(useViewStore.getState().table).toBe(first.exportName);
      answer = true;
      await user.click(target);
      expect(useViewStore.getState().table).toBe(second.exportName);
    } finally {
      window.confirm = original;
    }
  });
});
