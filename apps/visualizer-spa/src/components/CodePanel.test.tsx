/**
 * Панель кода ноды как её читает пользователь: роуты сервиса с запросами в БД и экранами,
 * таблицы с колонками, функции с сигнатурой и описанием; у экрана — вызовы API, несопоставленные,
 * фильтр, предел показа и переход к роуту.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiCall, ApiRoute, CodeSymbol, DbTable } from '@live-app-map/schema';
import type { PageCodeView, ScreenApiItem, ServiceCodeView } from '../lib/node-code';
import { useAppStore } from '../store/app-store';
import { openMap, resetStores } from '../test/fixtures';
import { CodePanel } from './CodePanel';

useDom();

beforeEach(resetStores);

const at = (file: string, line: number) => ({ file, line });

function route(id: string, extra: Partial<ApiRoute> = {}): ApiRoute {
  return { id, framework: 'elysia', method: 'GET', path: `/api/${id}`, serviceId: 'svc', location: at('src/r.ts', 3), handler: { location: at('src/r.ts', 4) }, dbCalls: [], ...extra };
}

const ROUTES: ApiRoute[] = [
  route('users', {
    doc: 'Список пользователей\nСо страницами',
    handler: { name: 'listUsers', location: at('src/r.ts', 10) },
    dbCalls: [
      { orm: 'drizzle', operation: 'select', table: 'users', location: at('src/r.ts', 11) },
      { orm: 'drizzle', operation: 'select', table: 'users', location: at('src/r.ts', 12) },
      { orm: 'drizzle', operation: 'insert', table: 'audit', location: at('src/r.ts', 13), inLoop: true },
    ],
  }),
  route('ping', { method: 'POST' }),
];

const TABLES: DbTable[] = [
  {
    id: 't1', orm: 'drizzle', name: 'users', exportName: 'usersTable', serviceId: 'svc', location: at('src/db.ts', 5), comments: ['Пользователи'],
    columns: [{ name: 'id', type: 'uuid' }, { name: 'fullName', sqlName: 'full_name', type: 'text' }],
  },
];

const SYMBOLS: CodeSymbol[] = [
  { id: 's1', kind: 'function', name: 'listUsers', serviceId: 'svc', location: at('src/r.ts', 10), signature: '(q: string) => User[]', doc: 'Ищет пользователей' },
  { id: 's2', kind: 'variable', name: 'LIMIT', serviceId: 'svc', location: at('src/r.ts', 1), comments: ['Предел выдачи', 'второй'] },
];

const SERVICE: ServiceCodeView = {
  kind: 'service',
  service: { id: 'svc', name: 'api', root: 'apps/api' },
  routes: ROUTES,
  tables: TABLES,
  symbols: SYMBOLS,
  callers: new Map([['users', [{ nodeId: 'page:a', title: 'Экран А' }, { nodeId: 'page:b', title: 'Экран Б' }]]]),
};

/** Стирает поле и печатает текст, как пользователь. */
async function retype(el: HTMLElement, text: string): Promise<void> {
  const user = userEvent.setup({ document });
  await user.clear(el);
  await user.type(el, text);
}

function items(root: HTMLElement, testId: string): string[] {
  return within(root).queryAllByTestId(testId).map((el) => el.textContent ?? '');
}

describe('панель кода сервиса', () => {
  test('роуты, таблицы и функции с описаниями, БД и экранами', () => {
    const { container } = render(<CodePanel view={SERVICE} />);
    expect(items(container, 'code-route')).toEqual([
      'GET/api/usersСписок пользователейСо страницамиБД: insert audit в цикле, select users ×2Экраны: Экран А, Экран БlistUsers · src/r.ts:3',
      'POST/api/pingБез комментарияsrc/r.ts:3',
    ]);
    expect(items(container, 'code-table')).toEqual(['drizzleusersПользователиКолонки: 2id: uuidfullName (full_name): textsrc/db.ts:5']);
    expect(items(container, 'code-symbol')).toEqual(['functionlistUsers(q: string) => User[]Ищет пользователейsrc/r.ts:10', 'variableLIMITПредел выдачиsrc/r.ts:1']);
    expect([...container.querySelectorAll('.code-section__title')].map((h) => h.textContent)).toEqual(['Роуты · 2', 'Таблицы · 1', 'Функции и компоненты · 2']);
    expect(container.querySelector('.drawer__hint')).toBeNull();
  });

  test('экран-вызыватель открывается по клику', () => {
    const doc = openMap('korbor-miniapp');
    const pages = doc.nodes.filter((n) => n.kind === 'page').slice(0, 2);
    const view: ServiceCodeView = { ...SERVICE, callers: new Map([['users', pages.map((p) => ({ nodeId: p.id, title: p.title }))]]) };
    const { container } = render(<CodePanel view={view} />);
    fireEvent.click(within(container).getByRole('button', { name: pages[1]?.title }));
    expect(useAppStore.getState().selectedPageId).toBe(pages[1]?.id ?? '');
  });

  test('фильтр по пути, имени и комментарию; роут, к которому перешли, — первым и вне фильтра', async () => {
    useAppStore.setState({ codeFocusRouteId: 'ping' });
    const { container } = render(<CodePanel view={SERVICE} />);
    expect(items(container, 'code-route-focused').map((t) => t.slice(0, 13))).toEqual(['POST/api/ping']);
    expect(items(container, 'code-route').map((t) => t.slice(0, 13))).toEqual(['GET/api/users']);
    await retype(within(container).getByLabelText('Фильтр кода'), 'предел');
    expect(items(container, 'code-route')).toEqual([]);
    expect(items(container, 'code-route-focused').length).toBe(1);
    expect(items(container, 'code-table')).toEqual([]);
    expect(items(container, 'code-symbol').map((t) => t.slice(0, 13))).toEqual(['variableLIMIT']);
    await retype(within(container).getByLabelText('Фильтр кода'), 'второй');
    expect(items(container, 'code-symbol').map((t) => t.slice(0, 13))).toEqual(['variableLIMIT']);
    await retype(within(container).getByLabelText('Фильтр кода'), 'usersTable');
    expect(items(container, 'code-table').length).toBe(1);
  });
});

function call(id: string, extra: Partial<ApiCall> = {}): ApiCall {
  return { id, serviceId: 'web', method: 'GET', path: `/api/${id}`, client: 'fetch', location: at('src/page.tsx', 7), ...extra };
}

describe('панель кода экрана', () => {
  const matched: ScreenApiItem = {
    call: call('users', { client: 'wrapper', via: 'api.get', routeId: 'users' }),
    via: 'useUsers',
    route: ROUTES[0],
    service: { id: 'svc', name: 'api', root: 'apps/api' },
    db: [{ operation: 'select', table: 'users', count: 1, inLoop: false }],
  };
  const noService: ScreenApiItem = { call: call('ping', { method: 'POST' }), route: ROUTES[1], db: [] };
  const unmatched: ScreenApiItem = { call: call('lost'), db: [] };
  const PAGE: PageCodeView = { kind: 'page', file: 'apps/web/src/page.tsx', symbols: [], api: [matched, noService], unmatched: [unmatched] };

  test('вызовы с роутом, сервисом и обёрткой; несопоставленные отдельно', () => {
    const { container } = render(<CodePanel view={PAGE} />);
    expect(container.querySelector('.drawer__hint')?.textContent).toBe('apps/web/src/page.tsx');
    expect(items(container, 'screen-api-call')).toEqual([
      'GET/api/usersapi · /api/usersСписок пользователейБД: select userswrapper · через useUsers · api.get · src/page.tsx:7 К роуту',
      'POST/api/pingsvc · /api/pingfetch · src/page.tsx:7 К роуту',
    ]);
    expect(items(container, 'screen-api-unmatched').filter((t) => t.startsWith('GET'))).toEqual(['GET/api/lostРоут не найден в исходникахfetch · src/page.tsx:7']);
  });

  test('«К роуту» открывает сервис роута с фокусом на нём', () => {
    const { container } = render(<CodePanel view={PAGE} />);
    fireEvent.click(within(container).getAllByTestId('go-to-route')[1] as HTMLElement);
    expect(useAppStore.getState().codeFocusRouteId).toBe('ping');
  });

  test('фильтр по сервису, обёртке и описанию роута', async () => {
    const { container } = render(<CodePanel view={PAGE} />);
    const filter = within(container).getByLabelText('Фильтр кода');
    await retype(filter, 'useusers');
    expect(items(container, 'screen-api-call').length).toBe(1);
    await retype(filter, 'со страницами');
    expect(items(container, 'screen-api-call').length).toBe(1);
    await retype(filter, 'api');
    expect(items(container, 'screen-api-call').length).toBe(2);
    await retype(filter, 'lost');
    expect(items(container, 'screen-api-call')).toEqual([]);
  });

  test('больше 100 вызовов — показаны первые 100 и подсказка', () => {
    const many: PageCodeView = { ...PAGE, api: Array.from({ length: 101 }, (_, i) => ({ call: call(`c${i}`), db: [] })), unmatched: [] };
    const { container } = render(<CodePanel view={many} />);
    expect(container.querySelectorAll('[data-testid="screen-api-unmatched"] li').length + items(container, 'screen-api-unmatched').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Показаны первые 100 из 101 — уточните фильтр.');
    const exactly: PageCodeView = { ...PAGE, api: many.api.slice(0, 100) };
    const second = render(<CodePanel view={exactly} />);
    expect(second.container.textContent).not.toContain('Показаны первые');
  });
});
