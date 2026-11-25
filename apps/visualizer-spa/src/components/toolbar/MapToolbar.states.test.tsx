/**
 * Шапка — состояния: какие вкладки видов есть у карты без кода и документации,
 * какая нажата, раскрыт ли лист, строка бюджета экранов, подпись карты в каталоге.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { AppMapDocument } from '@live-app-map/schema';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { jsonResponse, mapText, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { MapToolbar } from '../MapToolbar';
import { catalogLabel } from './use-map-loader';
import { listOptions } from '../../test/select';

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
  return within(ui.getByRole('group', { name: 'Вид' })).getAllByRole('button').map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}:${b.className.includes('bg-primary')}`);
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
      // Открытый модальный лист прячет шапку от чтения экрана — ищем и скрытые.
      const b = ui.getByRole('button', { name, hidden: true });
      return `${name}:${b.getAttribute('aria-expanded')}:${b.className.includes('bg-primary')}`;
    });
    const dogfoodCalls = () => net.calls.filter((c) => c.url.endsWith('/dogfood/actors')).length;
    expect(state()).toEqual(['Входы:false:false', 'Настройки:false:false']);
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    expect(state()).toEqual(['Входы:false:false', 'Настройки:true:true']);
    expect(dogfoodCalls()).toBe(0);
    fireEvent.click(ui.getByRole('button', { name: 'Входы', hidden: true }));
    expect(state()).toEqual(['Входы:true:true', 'Настройки:false:false']);
    expect(dogfoodCalls()).toBe(1);
  });

  test('строка бюджета: на паузе и предел паузы из store', () => {
    act(() => useAppStore.setState({ warmPageIds: new Set(['a', 'b']), maxWarmIframes: 5, maxLiveIframes: 3, pinnedPageIds: new Set(['p']) }));
    const ui = toolbar(null);
    fireEvent.click(ui.getByRole('button', { name: 'Настройки' }));
    expect(ui.getByTestId('iframe-budget').textContent?.replace(/\s+/g, ' ').trim()).toBe('Живых экранов 0 из 3 · на паузе 2 из 5 · закреплено 1');
  });

  test('без карты пункт «Очистить карту» недоступен, с картой — доступен', async () => {
    const ui = toolbar(null);
    const clear = async () => (await listOptions(ui.getByTestId('map-select'))).find((o) => o.label === 'Очистить карту')?.disabled;
    expect(await clear()).toBe(true);
    act(() => useAppStore.getState().loadDocument(openMap('korbor-miniapp')));
    expect(await clear()).toBe(false);
  });
});

test('подпись карты каталога: число экранов только если оно есть', () => {
  expect([catalogLabel(MINIAPP), catalogLabel({ ...MINIAPP, pageCount: 0 }), catalogLabel({ ...MINIAPP, pageCount: 1 })]).toEqual(['Korbor miniapp · 40 экр.', 'Korbor miniapp', 'Korbor miniapp · 1 экр.']);
});
