/**
 * Прокидывание dogfood-сессии в live URL (admin token / miniapp initData).
 * Токен/initData только на «свой» host — не засоряем site marketing URL.
 *
 * Korbor miniapp = createHashRouter: product path в hash (`#/feed`),
 * query (lam_init_data / lam_role) остаётся в search — dogfood читает location.search.
 */

export type DogfoodInject = {
  /** Raw Telegram initData — query lam_init_data */
  readonly miniappInitData?: string;
  /** Admin Bearer — query lam_access_token */
  readonly adminAccessToken?: string;
};

function portOf(u: URL): string {
  if (u.port) {
    return u.port;
  }
  return u.protocol === 'https:' ? '443' : '80';
}

/**
 * True, если URL — miniapp surface (TLS host / proxy / :5175).
 */
export function isMiniappUrl(u: URL): boolean {
  const port = portOf(u);
  return (
    u.hostname === 'vite.localhost' ||
    port === '5175' ||
    u.pathname.startsWith('/__lam_proxy/miniapp')
  );
}

function isAdminUrl(u: URL): boolean {
  const port = portOf(u);
  return port === '16002' || u.pathname.startsWith('/__lam_proxy/admin');
}

/**
 * Pathname product → hash route для createHashRouter.
 * `/__lam_proxy/miniapp/feed` → path `/__lam_proxy/miniapp/` + hash `#/feed`
 * `/feed` на vite.localhost → path `/` + hash `#/feed`
 * Query не трогаем. Уже `#/…` — no-op (кроме очистки ложного pathname).
 *
 * @param absoluteUrl - live URL miniapp
 */
export function ensureMiniappHashRoute(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl);
    if (!isMiniappUrl(u)) {
      return absoluteUrl;
    }

    // Уже hash-route
    if (u.hash.startsWith('#/')) {
      // На proxy: pathname должен быть префикс или /
      if (u.pathname.startsWith('/__lam_proxy/miniapp')) {
        const rest = u.pathname.slice('/__lam_proxy/miniapp'.length);
        if (rest !== '' && rest !== '/') {
          u.pathname = '/__lam_proxy/miniapp/';
        }
      } else if (u.pathname !== '/' && u.pathname !== '') {
        u.pathname = '/';
      }
      return u.href;
    }

    let productPath = u.pathname;
    if (productPath.startsWith('/__lam_proxy/miniapp')) {
      productPath = productPath.slice('/__lam_proxy/miniapp'.length);
      if (productPath === '') {
        productPath = '/';
      }
      u.pathname = '/__lam_proxy/miniapp/';
    } else {
      u.pathname = '/';
    }

    if (!productPath.startsWith('/')) {
      productPath = `/${productPath}`;
    }
    u.hash = productPath === '/' ? '#/' : `#${productPath}`;
    return u.href;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Добавляет dogfood query к URL (не дублирует ключи; только на свой surface).
 */
export function applyDogfoodToUrl(
  baseUrl: string,
  inject: DogfoodInject,
): string {
  try {
    const u = new URL(baseUrl);
    const init = inject.miniappInitData?.trim();
    if (init && isMiniappUrl(u)) {
      u.searchParams.set('lam_init_data', init);
    }
    const token = inject.adminAccessToken?.trim();
    if (token && isAdminUrl(u)) {
      u.searchParams.set('lam_access_token', token);
    }
    return u.href;
  } catch {
    return baseUrl;
  }
}
