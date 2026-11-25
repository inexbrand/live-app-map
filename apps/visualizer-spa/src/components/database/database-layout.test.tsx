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
  net = stubFetch(async (url, init) => {
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
    if (u.pathname.startsWith('/__lam_db/status')) {
      return Response.json({ state: 'off', reason: 'нет database в config.ts', hint: "database: { urlEnv: 'DATABASE_URL' }" });
    }
    return null;
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
});
