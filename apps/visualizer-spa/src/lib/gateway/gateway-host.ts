/**
 * Адреса шлюза: `<профиль>--<цель>.localhost:<порт>`. Каждая пара
 * «профиль сессии × приложение» — свой origin: куки, localStorage и
 * sessionStorage разных ролей не смешиваются.
 *
 * Цель кодируется так: `h16002` — http://localhost:16002, `s5175-vite` —
 * https://vite.localhost:5175, `h16000-ip` — http://127.0.0.1:16000.
 */

/** Профиль без сессии. */
export const ANON_PROFILE = 'anon';

/** Разобранный адрес шлюза. */
export type GatewayTarget = {
  readonly profile: string;
  /** Origin приложения: `https://vite.localhost:5175`. */
  readonly origin: string;
  readonly protocol: 'http:' | 'https:';
  readonly hostname: string;
  readonly port: number;
};

const PROFILE_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

/**
 * Профиль годится для имени хоста: строчные латинские буквы, цифры, дефис.
 *
 * @param id - id профиля
 */
export function isValidProfileId(id: string): boolean {
  return PROFILE_RE.test(id) && !id.includes('--');
}

/**
 * Метка цели из origin; null — не локальный хост.
 *
 * @param url - адрес приложения
 */
export function targetLabel(url: URL): string | null {
  const scheme = url.protocol === 'https:' ? 's' : url.protocol === 'http:' ? 'h' : null;
  if (scheme === null) {
    return null;
  }
  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost') {
    return `${scheme}${port}`;
  }
  if (host === '127.0.0.1') {
    return `${scheme}${port}-ip`;
  }
  const sub = /^([a-z0-9-]+)\.localhost$/.exec(host)?.[1];
  return sub === undefined || sub.includes('--') ? null : `${scheme}${port}-${sub}`;
}

/**
 * Адрес страницы через шлюз; null — приложение не локальное или профиль плохой.
 *
 * @param appUrl - адрес страницы приложения
 * @param profile - id профиля сессии
 * @param gatewayPort - порт шлюза
 */
export function toGatewayUrl(appUrl: string, profile: string, gatewayPort: number): string | null {
  let u: URL;
  try {
    u = new URL(appUrl);
  } catch {
    return null;
  }
  const label = targetLabel(u);
  if (label === null || !isValidProfileId(profile)) {
    return null;
  }
  return `http://${profile}--${label}.localhost:${gatewayPort}${u.pathname}${u.search}${u.hash}`;
}

/**
 * Разбирает заголовок Host запроса к шлюзу.
 *
 * @param host - `admin--h16002.localhost:4320`
 * @returns цель или null
 */
export function parseGatewayHost(host: string): GatewayTarget | null {
  const m = /^([a-z0-9-]+?)--([hs])(\d{1,5})(?:-([a-z0-9-]+))?\.localhost(?::\d+)?$/.exec(host.toLowerCase());
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  const profile = m[1];
  if (!isValidProfileId(profile)) {
    return null;
  }
  const port = Number(m[3]);
  if (port < 1 || port > 65535) {
    return null;
  }
  const protocol = m[2] === 's' ? 'https:' : 'http:';
  const hostname = m[4] === undefined ? 'localhost' : m[4] === 'ip' ? '127.0.0.1' : `${m[4]}.localhost`;
  return { profile, origin: `${protocol}//${hostname}:${port}`, protocol, hostname, port };
}
