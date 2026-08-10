/**
 * Прокидывание dogfood-сессии в live URL (admin token / miniapp initData).
 */

export type DogfoodInject = {
  /** Raw Telegram initData — query lam_init_data */
  readonly miniappInitData?: string;
  /** Admin Bearer — query lam_access_token */
  readonly adminAccessToken?: string;
};

/**
 * Добавляет dogfood query к URL (не дублирует ключи).
 */
export function applyDogfoodToUrl(baseUrl: string, inject: DogfoodInject): string {
  try {
    const u = new URL(baseUrl);
    const init = inject.miniappInitData?.trim();
    if (init) {
      u.searchParams.set('lam_init_data', init);
    }
    const token = inject.adminAccessToken?.trim();
    if (token) {
      u.searchParams.set('lam_access_token', token);
    }
    return u.href;
  } catch {
    return baseUrl;
  }
}
