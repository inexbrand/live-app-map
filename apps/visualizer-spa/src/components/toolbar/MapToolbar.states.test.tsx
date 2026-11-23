/**
 * Шапка — состояния: какие вкладки видов есть у карты без кода и документации,
 * какая нажата, раскрыт ли лист, строка бюджета экранов, подпись карты в каталоге,
 * разделители и кнопки крошек.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { AppMapDocument } from '@live-app-map/schema';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { useViewStore } from '../../store/view-store';
import { jsonResponse, mapText, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { MapToolbar } from '../MapToolbar';
import { catalogLabel } from './use-map-loader';
import { epochFileLabel } from '../../lib/docs-view-model';
import type { AppView } from '../../store/view-store';

useDom();

const MINIAPP: MapCatalogEntry = { id: 'korbor-miniapp', label: 'Korbor miniapp', path: '/maps/korbor-miniapp.liveappmap.json', baseUrl: 'https://vite.localhost:5175', pageCount: 40 };

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  window.history.replaceState(null, '', '/');
  net = stubFetch((url) => {
    if (url === MINIAPP.path) {
      return new Response(mapText('korbor-miniapp'), { status: 200 });
    }
    if (url.endsWith('/api/v1/dev/dogfood/actors')) {
      return jsonResponse({ data: { actors: [] } });
    }
    return undefined;
  });
});

afterEach(() => net.restore());

/** Карта korbor без групп, кода и документации. */
function bareMap(): AppMapDocument {
  const { groups: _g, code: _c, docs: _d, ...bare } = openMap('korbor-miniapp');
  return bare;
}

function toolbar(doc: AppMapDocument | null) {
  if (doc !== null) {
    act(() => useAppStore.getState().loadDocument(doc));
  }
  render(<MapToolbar catalog={[MINIAPP]} />);
  return within(document.body);
}

/** Вкладки видов: подпись и нажата ли. */
function tabs(ui: ReturnType<typeof within>): string[] {
  return within(ui.getByRole('group', { name: 'Вид' })).getAllByRole('button').map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}:${b.className.includes('ui-btn--primary')}`);
}

describe('вкладки видов', () => {
  test('карта без кода и документации: только экраны и сравнение; нажата текущая', () => {
    const ui = toolbar(bareMap());
    expect(tabs(ui)).toEqual(['Экраны:true:true', 'Сравнение:false:false']);
    fireEvent.click(within(ui.getByRole('group', { name: 'Вид' })).getByRole('button', { name: 'Сравнение' }));
    expect(tabs(ui)).toEqual(['Экраны:false:false', 'Сравнение:true:true']);
  });

  test('код без таблиц и роутов — вкладок API и БД нет; документация есть', () => {
    const doc = openMap('korbor-miniapp');
    const code = doc.code;
    if (code === undefined) {
      throw new Error('в карте нет кода');
    }
    const ui = toolbar({ ...doc, code: { ...code, tables: [], routes: code.routes.slice(0, 1) } });
    expect(tabs(ui).map((t) => t.split(':')[0])).toEqual(['Экраны', 'API', 'Документация', 'Сравнение']);
  });
});

describe('листы шапки', () => {
  test('кнопка листа отмечена и раскрыта, пока лист открыт; пользователи dev-входа грузятся только с листом «Входы»', () => {
    const ui = toolbar(null);
    const state = () => ['Входы', 'Настройки'].map((name) => {
      const b = ui.getByRole('button', { name });
      return `${name}:${b.getAttribute('aria-expanded')}:${b.className.includes('ui-btn--primary')}`;
    });
    const dogfoodCalls = () => net.calls.filter((c) => c.url.endsWith('/dogfood/actors')).length;
    expect(state()).toEqual(['Входы:false:false', 'Настройки:false:false']);
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    expect(state()).toEqual(['Входы:false:false', 'Настройки:true:true']);
    expect(dogfoodCalls()).toBe(0);
    fireEvent.click(ui.getByRole('button', { name: 'Входы' }));
    expect(state()).toEqual(['Входы:true:true', 'Настройки:false:false']);
    expect(dogfoodCalls()).toBe(1);
  });

  test('строка бюджета: на паузе и предел паузы из store', () => {
    act(() => useAppStore.setState({ warmPageIds: new Set(['a', 'b']), maxWarmIframes: 5, maxLiveIframes: 3, pinnedPageIds: new Set(['p']) }));
    const ui = toolbar(null);
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    expect(ui.getByTestId('iframe-budget').textContent?.replace(/\s+/g, ' ').trim()).toBe('Живых экранов 0 из 3 · на паузе 2 из 5 · закреплено 1');
  });

  test('без карты пункт «Очистить карту» недоступен, с картой — доступен', () => {
    const ui = toolbar(null);
    const clear = () => within(ui.getByTestId('map-select')).getByText('── Очистить карту ──').hasAttribute('disabled');
    expect(clear()).toBe(true);
    act(() => useAppStore.getState().loadDocument(openMap('korbor-miniapp')));
    expect(clear()).toBe(false);
  });
});

test('подпись карты каталога: число экранов только если оно есть', () => {
  expect([catalogLabel(MINIAPP), catalogLabel({ ...MINIAPP, pageCount: 0 }), catalogLabel({ ...MINIAPP, pageCount: 1 })]).toEqual(['Korbor miniapp · 40 экр.', 'Korbor miniapp', 'Korbor miniapp · 1 экр.']);
});

describe('крошки', () => {
  /** Крошки: тег, класс, есть ли разделитель перед ней. */
  function crumbs(ui: ReturnType<typeof within>): string[] {
    return within(ui.getByTestId('breadcrumbs')).getAllByRole('listitem').map((li) => {
      const el = li.lastElementChild;
      return `${li.querySelector('.crumbs__sep') === null ? '' : '>'}${el?.tagName}.${el?.className}|${el?.textContent}`;
    });
  }

  test('эпоха посередине — кнопка, группа экрана — текст; разделитель перед всеми, кроме первой', () => {
    const doc = openMap('korbor-miniapp');
    const epoch = doc.docs?.epochs[0];
    if (epoch === undefined) {
      throw new Error('нет эпох');
    }
    const ui = toolbar(doc);
    act(() => useViewStore.getState().openDoc(epoch.dir));
    const first = epoch.files[0]?.path ?? '';
    expect(crumbs(ui)).toEqual(['BUTTON.crumbs__link|Документация', `>BUTTON.crumbs__link|${epoch.slug}`, `>SPAN.crumbs__current|${epochFileLabel(epoch.dir, first)}`]);
  });

  test('карта без групп, кода и документации: у экрана — корень и экран; на пустых видах крошек нет', () => {
    const doc = bareMap();
    const page = doc.nodes.find((n) => n.kind === 'page');
    if (page === undefined) {
      throw new Error('нет экрана');
    }
    const ui = toolbar(doc);
    act(() => useAppStore.getState().selectPage(page.id));
    expect(crumbs(ui)).toEqual(['BUTTON.crumbs__link|Экраны', `>SPAN.crumbs__current|${page.title}`]);
    const views: readonly AppView[] = ['api', 'database', 'docs'];
    for (const view of views) {
      act(() => useViewStore.getState().setView(view));
      expect(ui.queryByTestId('breadcrumbs')).toBeNull();
    }
    act(() => useViewStore.getState().openDoc('docs/agent-notes/x.md'));
    expect(crumbs(ui)).toEqual(['BUTTON.crumbs__link|Документация', '>SPAN.crumbs__current|docs/agent-notes/x.md']);
  });

  test('граф: имя узла — последний сегмент пути', () => {
    const ui = toolbar(openMap('korbor-miniapp'));
    act(() => {
      useViewStore.getState().setView('docs');
      useViewStore.getState().setDocsMode('graph');
      useDocGraphStore.setState({ selected: 'file:apps/a/b.ts' });
    });
    expect(crumbs(ui).at(-1)).toBe('>SPAN.crumbs__current|b.ts');
  });
});
