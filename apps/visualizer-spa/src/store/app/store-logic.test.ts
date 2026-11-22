/**
 * Логика store визуализатора: базовый URL, бюджет iframe, live URL, загрузка карты.
 * Карта для загрузки — настоящая korbor-miniapp; для краевых случаев — свои ноды.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { indexDocument } from '@live-app-map/graph';
import { DEFAULT_MAX_LIVE, DEFAULT_MAX_WARM } from '@live-app-map/iframe-policy';
import {
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
  type AppMapDocument,
  type AppMapNode,
  type AppMapPageState,
  type Diagnostic,
} from '@live-app-map/schema';
import { useAppStore } from '../app-store';
import { checkBaseUrl, countAbsolutePageHosts, withBaseUrl } from './base-url';
import { clampMaxLive, clampMaxWarm, computeLiveBudget, type LiveBudgetInput } from './iframe-budget';
import { resolveLiveUrl, type LiveUrlInput } from './live-url';

function miniapp(): AppMapDocument {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../../public/maps/korbor-miniapp.liveappmap.json', import.meta.url), 'utf8'));
  const parsed = parseLiveAppMapDocument(raw);
  if (!parsed.ok) {
    throw new Error('карта korbor-miniapp не разобралась');
  }
  return liveAppMapToAppMap(parsed.document);
}

const real = miniapp();

type NodeSpec = {
  readonly id: string;
  readonly kind?: AppMapNode['kind'];
  readonly url?: string;
  readonly pathPattern?: string;
  readonly pathExample?: string;
  readonly enabled?: boolean;
  readonly states?: readonly AppMapPageState[];
};

/** Нода карты: экран по умолчанию. */
function node(spec: NodeSpec): AppMapNode {
  return {
    id: spec.id,
    kind: spec.kind ?? 'page',
    title: spec.id,
    pathPattern: spec.pathPattern ?? `/${spec.id}`,
    ...(spec.pathExample === undefined ? {} : { pathExample: spec.pathExample }),
    ...(spec.url === undefined ? {} : { url: spec.url }),
    ...(spec.enabled === undefined ? {} : { iframePolicy: { enabled: spec.enabled } }),
    ...(spec.states === undefined ? {} : { states: spec.states }),
  };
}

function docWith(nodes: readonly AppMapNode[], baseUrl: string | null = null, edges: AppMapDocument['edges'] = []): AppMapDocument {
  return { ...real, nodes: [...nodes], edges, baseUrl };
}

describe('базовый URL', () => {
  test('хосты считаются только у экранов и not-found с http(s)', () => {
    const doc = docWith([
      node({ id: 'a', url: 'http://a.test/x' }),
      node({ id: 'b', url: 'https://b.test/y' }),
      node({ id: 'nf', kind: 'not-found', url: 'http://c.test/404' }),
      node({ id: 'svc', kind: 'service', url: 'http://d.test/' }),
      node({ id: 'svc2', kind: 'service', url: 'http://d2.test/' }),
      node({ id: 'ftp', url: 'ftp://e.test/' }),
      node({ id: 'ws', url: 'ws://f.test/' }),
      node({ id: 'rel', url: '/relative' }),
      node({ id: 'none' }),
    ]);
    expect(countAbsolutePageHosts(doc)).toBe(3);
  });

  test('переписываются экраны; сервис не трогается; пример пути важнее шаблона, даже пустой', () => {
    const doc = docWith([
      node({ id: 'svc', kind: 'service', pathPattern: 'apps/api' }),
      node({ id: 'p', pathPattern: '/u/[id]', pathExample: '/u/7' }),
      node({ id: 'e', pathPattern: '/e', pathExample: '' }),
      node({ id: 'q', pathPattern: 'q' }),
    ]);
    const r = withBaseUrl(doc, 'http://base.test');
    expect(r.error).toBeNull();
    const urls = new Map(r.document.nodes.map((n) => [n.id, n.url]));
    expect(urls.get('svc')).toBeUndefined();
    expect(urls.get('p')).toBe('http://base.test/u/7');
    expect(urls.get('e')).toBe('http://base.test/');
    expect(urls.get('q')).toBe('http://base.test/q');
  });

  test('проверка введённого base без карты', () => {
    expect(checkBaseUrl('http://a.test')).toBeNull();
    expect(checkBaseUrl('https://a.test')).toBeNull();
    expect(checkBaseUrl('ftp://a.test')?.message).toBe('Base URL: только http/https («ftp://a.test»)');
    expect(checkBaseUrl('не адрес')?.diagnostic).toEqual({
      code: 'INVALID_BASE_URL',
      severity: 'error',
      message: 'Некорректный Base URL: «не адрес»',
      path: 'baseUrl',
    });
  });
});

describe('лимиты iframe', () => {
  test('не число — по умолчанию; 0, минус и 9999+ — без лимита; иначе округление', () => {
    expect(clampMaxLive(Number.NaN)).toBe(DEFAULT_MAX_LIVE);
    expect(clampMaxWarm(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MAX_WARM);
    for (const n of [0, -3, 0.4, 9999, 12000]) {
      expect(clampMaxLive(n)).toBe(9999);
    }
    expect(clampMaxLive(1)).toBe(1);
    expect(clampMaxLive(6.6)).toBe(7);
    expect(clampMaxWarm(9998)).toBe(9998);
  });
});

/** Вход раскладки: все экраны с адресом, ничего не выбрано. */
function budgetInput(doc: AppMapDocument, over: Partial<LiveBudgetInput> = {}): LiveBudgetInput {
  return {
    document: doc,
    index: indexDocument(doc),
    selectedPageId: null,
    mode: 'live',
    maxLiveIframes: 10,
    maxWarmIframes: 10,
    pinnedPageIds: new Set(),
    visiblePageIds: new Set(),
    livePageIds: new Set(),
    warmPageIds: new Set(),
    warmLruOrder: [],
    resolveLiveUrl: (id) => `http://x.test/${id}`,
    ...over,
  };
}

describe('раскладка iframe', () => {
  const doc = docWith(
    [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'nf', kind: 'not-found' }), node({ id: 'svc', kind: 'service' }), node({ id: 'off', enabled: false })],
    null,
    [{ id: 'a-b', from: 'a', to: 'b', kind: 'link', confidence: 'high' }],
  );

  test('живут видимые экраны и not-found; сервис и выключенный iframe — нет', () => {
    const { sets } = computeLiveBudget(budgetInput(doc, { visiblePageIds: new Set(['a', 'nf', 'svc', 'off']) }));
    expect([...sets.livePageIds].sort()).toEqual(['a', 'nf']);
  });

  test('сосед выбранного прогревается без видимости', () => {
    const { sets } = computeLiveBudget(budgetInput(doc, { selectedPageId: 'a' }));
    expect(sets.livePageIds.has('b')).toBe(true);
  });

  test('без карты — пусто', () => {
    const { sets, deferredPins } = computeLiveBudget(budgetInput(doc, { document: null }));
    expect(sets.livePageIds.size + sets.mountedPageIds.size + sets.warmLruOrder.length).toBe(0);
    expect(deferredPins).toEqual([]);
  });
});

/** Вход live URL: карта с base, без роли и стейтов. */
function urlInput(doc: AppMapDocument, over: Partial<LiveUrlInput> = {}): LiveUrlInput {
  return {
    document: doc,
    index: indexDocument(doc),
    activeStates: new Map(),
    globalRole: '',
    baseUrlOverride: '',
    dogfoodMiniappInitData: '',
    dogfoodAdminAccessToken: '',
    useTlsProxy: false,
    ...over,
  };
}

describe('live URL', () => {
  const doc = docWith(
    [
      node({ id: 'p', pathPattern: '/p' }),
      node({ id: 's', pathPattern: '/s', states: [{ name: 'empty' }, { name: 'emp', inject: { role: 'employer' } }, { name: 'own', url: 'http://app.test/own' }] }),
    ],
    'http://app.test',
  );

  test('без индекса или карты — null', () => {
    expect(resolveLiveUrl(urlInput(doc, { index: null }), 'p')).toBeNull();
    expect(resolveLiveUrl(urlInput(doc, { document: null }), 'p')).toBeNull();
  });

  test('base карты, если своего нет; свой — важнее', () => {
    expect(resolveLiveUrl(urlInput(doc), 'p')).toContain('http://app.test/');
    expect(resolveLiveUrl(urlInput(doc, { baseUrlOverride: 'http://mine.test' }), 'p')).toContain('http://mine.test/');
  });

  test('глобальная роль попадает в адрес; без роли — нет', () => {
    expect(resolveLiveUrl(urlInput(doc, { globalRole: 'recruiter' }), 'p')).toContain('lam_role=recruiter');
    expect(resolveLiveUrl(urlInput(doc), 'p')).not.toContain('lam_role');
  });

  test('стейт без inject и неизвестный стейт не ломают адрес', () => {
    const plain = resolveLiveUrl(urlInput(doc), 's');
    expect(resolveLiveUrl(urlInput(doc, { activeStates: new Map([['s', 'empty']]) }), 's')).toBe(plain);
    expect(resolveLiveUrl(urlInput(doc, { activeStates: new Map([['p', 'нет такого']]) }), 'p')).toBe(resolveLiveUrl(urlInput(doc), 'p'));
  });

  test('стейт со своим адресом без inject: адрес стейта и глобальная роль', () => {
    const url = resolveLiveUrl(urlInput(doc, { globalRole: 'recruiter', activeStates: new Map([['s', 'own']]) }), 's') ?? '';
    expect(url).toContain('http://app.test/own');
    expect(url).toContain('lam_role=recruiter');
  });

  test('роль стейта важнее глобальной', () => {
    const url = resolveLiveUrl(urlInput(doc, { globalRole: 'recruiter', activeStates: new Map([['s', 'emp']]) }), 's') ?? '';
    expect(url).toContain('lam_role=employer');
    expect(url).not.toContain('recruiter');
  });
});

describe('загрузка карты в store', () => {
  test('значения по умолчанию', () => {
    const s = useAppStore.getInitialState();
    expect([s.loadSeq, s.mode, s.iframeScale, s.baseUrlOverride, s.document]).toEqual([0, 'live', 0.5, '', null]);
  });

  test('номер загрузки растёт на 1; в журнале — число экранов без сервисов', () => {
    const before = useAppStore.getState().loadSeq;
    useAppStore.getState().loadDocument(docWith([node({ id: 'a' }), node({ id: 'b' }), node({ id: 'svc', kind: 'service' })]));
    const s = useAppStore.getState();
    expect(s.loadSeq).toBe(before + 1);
    expect(s.logs.at(-1)?.message).toBe(`Карта загружена: 2 экранов, revision ${real.revision}`);
  });

  test('base карты переписывает относительные адреса; абсолютный адрес одного хоста не трогается', () => {
    useAppStore.getState().setBaseUrlOverride('');
    useAppStore.getState().loadDocument(docWith([node({ id: 'rel' }), node({ id: 'abs', url: 'http://other.test/abs' })], 'http://map.test'));
    const urls = new Map(useAppStore.getState().document?.nodes.map((n) => [n.id, n.url]));
    expect(urls.get('rel')).toBe('http://map.test/rel');
    expect(urls.get('abs')).toBe('http://other.test/abs');
  });

  test('свой base: одна поверхность переписывается, две — нет', () => {
    useAppStore.getState().setBaseUrlOverride('http://mine.test');
    useAppStore.getState().loadDocument(docWith([node({ id: 'a', url: 'http://one.test/a' })]));
    expect(useAppStore.getState().document?.nodes[0]?.url).toBe('http://mine.test/a');
    useAppStore.getState().loadDocument(docWith([node({ id: 'a', url: 'http://one.test/a' }), node({ id: 'b', url: 'http://two.test/b' })]));
    expect(useAppStore.getState().document?.nodes.map((n) => n.url)).toEqual(['http://one.test/a', 'http://two.test/b']);
    useAppStore.getState().setBaseUrlOverride('');
  });

  test('старая ошибка base из предупреждений не остаётся при верном base', () => {
    const stale: Diagnostic = { code: 'INVALID_BASE_URL', severity: 'error', message: 'старое', path: 'baseUrl' };
    const other: Diagnostic = { code: 'SCAN_OK', severity: 'info', message: 'ок' };
    useAppStore.getState().loadDocument(docWith([node({ id: 'a' })], 'http://map.test'), [stale, other]);
    expect(useAppStore.getState().parseIssues).toEqual([other]);
    useAppStore.getState().setBaseUrlOverride('http://x.test');
    expect(useAppStore.getState().parseIssues).toEqual([other]);
    useAppStore.getState().setBaseUrlOverride('');
  });

  test('разбор JSON: карта — true, не карта — false и ошибка первого разборщика', () => {
    expect(useAppStore.getState().loadUnknownJson(JSON.parse(readFileSync(new URL('../../../public/maps/korbor-miniapp.liveappmap.json', import.meta.url), 'utf8')))).toBe(true);
    // Ошибки разборщиков различаются: видно, чья и какая по счёту взята
    const bad = { version: '1.0', pages: 'x' };
    expect(useAppStore.getState().loadUnknownJson(bad)).toBe(false);
    const live = parseLiveAppMapDocument(bad);
    const app = parseAppMapDocument(bad);
    const first = (!live.ok ? live.errors[0]?.message : undefined) ?? (!app.ok ? app.errors[0]?.message : undefined);
    expect(useAppStore.getState().lastLoadError).toBe(`Не удалось разобрать JSON: ${first}`);
  });

  test('без карты: пустой base снимает ошибку и toast; верный — убирает только ошибку base', () => {
    useAppStore.getState().clearMap();
    useAppStore.getState().setBaseUrlOverride('ftp://x');
    expect(useAppStore.getState().toast).toBe('Base URL: только http/https («ftp://x»)');
    useAppStore.getState().setBaseUrlOverride('   ');
    expect([useAppStore.getState().lastLoadError, useAppStore.getState().toast]).toEqual([null, null]);
    const other: Diagnostic = { code: 'SCAN_OK', severity: 'info', message: 'ок' };
    useAppStore.setState({ parseIssues: [other, { code: 'INVALID_BASE_URL', severity: 'error', message: 'x', path: 'baseUrl' }] });
    useAppStore.getState().setBaseUrlOverride('http://ok.test');
    expect(useAppStore.getState().parseIssues).toEqual([other]);
    useAppStore.getState().setBaseUrlOverride('');
  });
});
