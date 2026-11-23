/**
 * Live URL экрана: base, стейт, роль, шлюз профилей или dogfood-вход и TLS-proxy.
 */
import { applyStateToUrl, resolveNodeUrl } from '@live-app-map/graph';
import { applyDogfoodToUrl, ensureMiniappHashRoute } from '../../lib/dogfood-url';
import { cellOf, toGatewayUrl } from '../../lib/gateway/gateway-host';
import { pickNodeProfile } from '../../lib/gateway/profile-pick';
import { sampledPath, withPathname } from '../../lib/route-samples';
import { rewriteUrlThroughTlsProxy, shouldUseTlsProxyForUrl } from '../../lib/tls-proxy';
import { useGatewayStore } from '../gateway-store';
import type { AppStore } from './types';

/** Что нужно для live URL. */
export type LiveUrlInput = Pick<
  AppStore,
  'document' | 'index' | 'activeStates' | 'globalRole' | 'baseUrlOverride' | 'dogfoodMiniappInitData' | 'dogfoodAdminAccessToken' | 'useTlsProxy'
>;

type MapNode = NonNullable<ReturnType<NonNullable<LiveUrlInput['index']>['nodesById']['get']>>;
type PageState = NonNullable<MapNode['states']>[number];

/** Роль для URL: роль стейта, иначе общая; пусто — без роли. */
function stateRole(pageState: PageState | undefined, globalRole: string): string | undefined {
  const own = pageState?.inject?.role;
  if (own !== undefined && own !== '') {
    return own;
  }
  return globalRole !== '' ? globalRole : undefined;
}

/** URL с выбранным стейтом: его адрес (или base), роль, query и hash стейта. */
function urlWithState(base: string, pageState: PageState | undefined, globalRole: string): string {
  const roleQuery: Record<string, string> = globalRole !== '' ? { lam_role: globalRole } : {};
  return applyStateToUrl(pageState?.url || base, {
    role: stateRole(pageState, globalRole),
    query: { ...roleQuery, ...pageState?.inject?.query },
    hash: pageState?.inject?.hash,
  });
}

/** Шлюз: сессия профиля вместо query-токенов и TLS-прокси. */
function gatewayUrl(withState: string, node: MapNode, doc: NonNullable<LiveUrlInput['document']>, ctx: { readonly id: string; readonly stateName: string | undefined; readonly globalRole: string; readonly port: number }): string {
  const gateway = useGatewayStore.getState();
  const hashed = ensureMiniappHashRoute(withState);
  let appOrigin = '';
  try {
    appOrigin = new URL(hashed).origin;
  } catch {
    return hashed;
  }
  const profile = pickNodeProfile(node, { profiles: gateway.profiles, appOrigin, stateName: ctx.stateName, globalRole: ctx.globalRole });
  // Параметры маршрута — реальные id из API под этим профилем, если уже прочитаны.
  const real = sampledPath(doc, node, gateway.samples.get(profile));
  const target = real === null ? hashed : ensureMiniappHashRoute(withPathname(withState, real));
  return toGatewayUrl(target, profile, ctx.port, cellOf(ctx.id)) ?? target;
}

/** Origin визуализатора для TLS-прокси. */
function proxyOrigin(): string {
  return typeof globalThis.location !== 'undefined' && globalThis.location?.origin ? globalThis.location.origin : 'http://localhost:4310';
}

/** Без шлюза: dogfood-вход в query, HashRouter мини-аппа, TLS-прокси для self-signed HTTPS. */
function directUrl(withState: string, store: LiveUrlInput): string {
  // Dogfood inject: miniapp initData + admin token (Korbor читает query)
  const injected = applyDogfoodToUrl(withState, {
    miniappInitData: store.dogfoodMiniappInitData,
    adminAccessToken: store.dogfoodAdminAccessToken,
  });
  // Miniapp HashRouter: /feed → /#/feed (query остаётся в search)
  const url = ensureMiniappHashRoute(injected);
  if (!store.useTlsProxy || !shouldUseTlsProxyForUrl(url)) {
    return url;
  }
  // Self-signed HTTPS miniapp: same-origin proxy (secure:false на Vite);
  // proxy path может снова «съесть» product path — нормализуем hash
  return ensureMiniappHashRoute(rewriteUrlThroughTlsProxy(url, proxyOrigin()));
}

/** Адрес экрана без стейта: по шаблону и base, иначе свой url ноды; пусто — нет. */
function baseUrlOf(node: MapNode, baseUrl: string | null | undefined): string | null {
  return resolveNodeUrl(node, baseUrl ?? null) || node.url || null;
}

/** Выбранный стейт экрана: имя и описание (нет имени — без стейта). */
function activeState(node: MapNode, store: LiveUrlInput, id: string): { readonly name: string | undefined; readonly state: PageState | undefined } {
  const name = store.activeStates.get(id);
  return { name, state: name ? node.states?.find((s) => s.name === name) : undefined };
}

/** Экран карты по id; сервис бэкенда — не экран: pathPattern у него каталог в репо, а не URL. */
function screenOf(store: LiveUrlInput, id: string): MapNode | null {
  const node = store.document && store.index ? store.index.nodesById.get(id) : undefined;
  return !node || node.kind === 'service' ? null : node;
}

/** Всё, от чего зависит адрес: смена любого значения сбрасывает кэш. */
function cacheKeyOf(store: LiveUrlInput): readonly unknown[] {
  const gateway = useGatewayStore.getState();
  return [
    store.document,
    store.index,
    store.activeStates,
    store.globalRole,
    store.baseUrlOverride,
    store.dogfoodMiniappInitData,
    store.dogfoodAdminAccessToken,
    store.useTlsProxy,
    gateway.port,
    gateway.profiles,
    gateway.samples,
  ];
}

/** Кэш адресов: один набор входов — одна карта id → адрес. */
let cache: { key: readonly unknown[]; urls: Map<string, string | null> } = { key: [], urls: new Map() };

/**
 * Live URL экрана; null — нет карты, ноды, URL или это сервис. Адрес считается один раз
 * на набор входов: селекторы всех нод зовут его на каждое изменение store.
 *
 * @param store - состояние store
 * @param id - id ноды
 */
export function resolveLiveUrl(store: LiveUrlInput, id: string): string | null {
  const key = cacheKeyOf(store);
  if (key.length !== cache.key.length || key.some((v, i) => !Object.is(v, cache.key[i]))) {
    cache = { key, urls: new Map() };
  }
  const hit = cache.urls.get(id);
  if (hit !== undefined) {
    return hit;
  }
  const url = computeLiveUrl(store, id);
  cache.urls.set(id, url);
  return url;
}

/** Адрес экрана без кэша. */
function computeLiveUrl(store: LiveUrlInput, id: string): string | null {
  const node = screenOf(store, id);
  const doc = store.document;
  const base = node === null || doc === null ? null : baseUrlOf(node, store.baseUrlOverride || doc.baseUrl);
  if (node === null || doc === null || base === null) {
    return null;
  }
  const active = activeState(node, store, id);
  const withState = urlWithState(base, active.state, store.globalRole);
  const port = useGatewayStore.getState().port;
  return port === null ? directUrl(withState, store) : gatewayUrl(withState, node, doc, { id, stateName: active.name, globalRole: store.globalRole, port });
}
