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
  let u: URL;
  try {
    u = new URL(absoluteUrl);
  } catch {
    return absoluteUrl;
  }
  if (!isMiniappUrl(u)) {
    return absoluteUrl;
  }
  // Уже hash-route: pathname — префикс proxy или /
  if (u.hash.startsWith('#/')) {
    u.pathname = rootOf(u.pathname, u.pathname);
    return u.href;
  }
  const onProxy = u.pathname.startsWith(MINIAPP_PROXY);
  const productPath = (onProxy ? u.pathname.slice(MINIAPP_PROXY.length) : u.pathname) || '/';
  u.pathname = onProxy ? `${MINIAPP_PROXY}/` : '/';
  const hashPath = productPath.startsWith('/') ? productPath : `/${productPath}`;
  u.hash = hashPath === '/' ? '#/' : `#${hashPath}`;
  return u.href;
}

const MINIAPP_PROXY = '/__lam_proxy/miniapp';

/** Корень мини-аппа для hash-route: на proxy — его префикс, иначе «/»; уже корень — как есть. */
function rootOf(pathname: string, keep: string): string {
  if (pathname.startsWith(MINIAPP_PROXY)) {
    const rest = pathname.slice(MINIAPP_PROXY.length);
    return rest !== '' && rest !== '/' ? `${MINIAPP_PROXY}/` : keep;
  }
  return pathname !== '/' && pathname !== '' ? '/' : keep;
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