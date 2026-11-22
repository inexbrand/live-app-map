/**
 * Настройки dogfood в localStorage origin визуализатора.
 */

export const LS_INIT = 'lam.dogfood.miniappInitData';
export const LS_ADMIN = 'lam.dogfood.adminAccessToken';
export const LS_TLS_PROXY = 'lam.dogfood.useTlsProxy';

/**
 * Значение ключа; пусто, если хранилища нет или оно недоступно.
 *
 * @param key - ключ localStorage
 */
export function readLs(key: string): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/**
 * Записать значение; пустая строка удаляет ключ.
 *
 * @param key - ключ localStorage
 * @param value - значение
 */
export function writeLs(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    if (value.trim() === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}
