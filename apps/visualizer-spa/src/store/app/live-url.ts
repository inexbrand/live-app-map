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

/**
 * Live URL экрана; null — нет карты, ноды, URL или это сервис.
 *
 * @param store - состояние store
 * @param id - id ноды
 */
export function resolveLiveUrl(store: LiveUrlInput, id: string): string | null {
  const {
    document,
    index,
    activeStates,
    globalRole,
    baseUrlOverride,
    dogfoodMiniappInitData,
    dogfoodAdminAccessToken,
  } = store;
  if (!document || !index) {
    return null;
  }
  const node = index.nodesById.get(id);
  // Сервис бэкенда — не экран: pathPattern у него каталог в репо, а не URL.
  if (!node || node.kind === 'service') {
    return null;
  }
  const base =
    resolveNodeUrl(node, baseUrlOverride || document.baseUrl) ??
    node.url ??
    null;
  if (!base) {
    return null;
  }

  const stateName = activeStates.get(id);
  const pageState = stateName
    ? node.states?.find((s) => s.name === stateName)
    : undefined;

  const role =
    pageState?.inject?.role !== undefined && pageState.inject.role !== ''
      ? pageState.inject.role
      : globalRole !== ''
        ? globalRole
        : undefined;

  const withState = pageState?.url
    ? applyStateToUrl(pageState.url, {
        role,
        query: {
          ...(globalRole !== '' ? { lam_role: globalRole } : {}),
          ...pageState.inject?.query,
        },
        hash: pageState.inject?.hash,
      })
    : applyStateToUrl(base, {
        role,
        query: {
          ...(globalRole !== '' ? { lam_role: globalRole } : {}),
          ...pageState?.inject?.query,
        },
        hash: pageState?.inject?.hash,
      });

  // Шлюз: сессия профиля вместо query-токенов и TLS-прокси.
  const gateway = useGatewayStore.getState();
  if (gateway.port !== null) {
    const hashed = ensureMiniappHashRoute(withState);
    let appOrigin = '';
    try {
      appOrigin = new URL(hashed).origin;
    } catch {
      return hashed;
    }
    const profile = pickNodeProfile(node, { profiles: gateway.profiles, appOrigin, stateName, globalRole });
    // Параметры маршрута — реальные id из API под этим профилем, если уже прочитаны.
    const real = sampledPath(document, node, gateway.samples.get(profile));
    const target = real === null ? hashed : ensureMiniappHashRoute(withPathname(withState, real));
    return toGatewayUrl(target, profile, gateway.port, cellOf(id)) ?? target;
  }

  // Dogfood inject: miniapp initData + admin token (Korbor читает query)
  let url = applyDogfoodToUrl(withState, {
    miniappInitData: dogfoodMiniappInitData,
    adminAccessToken: dogfoodAdminAccessToken,
  });

  // Miniapp HashRouter: /feed → /#/feed (query остаётся в search)
  url = ensureMiniappHashRoute(url);

  // Self-signed HTTPS miniapp: same-origin proxy (secure:false на Vite)
  if (store.useTlsProxy && shouldUseTlsProxyForUrl(url)) {
    const origin =
      typeof globalThis.location !== 'undefined' && globalThis.location?.origin
        ? globalThis.location.origin
        : 'http://localhost:4310';
    url = rewriteUrlThroughTlsProxy(url, origin);
    // proxy path может снова «съесть» product path — нормализуем hash
    url = ensureMiniappHashRoute(url);
  }

  return url;
}
