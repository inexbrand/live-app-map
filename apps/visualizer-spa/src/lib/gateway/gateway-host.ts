/**
 * Адреса шлюза: `<профиль>--<цель>[--<ячейка>].localhost:<порт>`. Каждая
 * пара «профиль сессии × приложение» — свой origin: куки и хранилища разных
 * ролей не смешиваются. Ячейка (короткий хэш id ноды) даёт каждой ноде
 * собственный origin: sessionStorage общий у всех iframe вкладки с одним
 * origin, и приложение в одном iframe иначе уводит соседние (цель перехода
 * после входа, последняя вкладка).
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
const CELL_RE = /^[a-z0-9]{1,12}$/;
const LABEL_RE = /^([hs])(\d{1,5})(?:-([a-z0-9-]+))?$/;

/**
 * Ячейка ноды: короткий стабильный хэш её id (FNV-1a, base36).
 *
 * @param nodeId - id ноды карты
 */
export function cellOf(nodeId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < nodeId.length; i++) {
    h = Math.imul(h ^ nodeId.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(36);
}

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
export function toGatewayUrl(appUrl: string, profile: string, gatewayPort: number, cell?: string): string | null {
  let u: URL;
  try {
    u = new URL(appUrl);
  } catch {
    return null;
  }
  const label = targetLabel(u);
  if (label === null || !isValidProfileId(profile) || (cell !== undefined && !CELL_RE.test(cell))) {
    return null;
  }
  const suffix = cell === undefined ? '' : `--${cell}`;
  return `http://${profile}--${label}${suffix}.localhost:${gatewayPort}${u.pathname}${u.search}${u.hash}`;
}

/**
 * Разбирает заголовок Host запроса к шлюзу.
 *
 * @param host - `admin--h16002.localhost:4320`
 * @returns цель или null
 */
export function parseGatewayHost(host: string): GatewayTarget | null {
  const name = /^([a-z0-9-]+)\.localhost(?::\d+)?$/.exec(host.toLowerCase())?.[1];
  const [profile, label, cell, ...extra] = name === undefined ? [] : name.split('--');
  if (profile === undefined || label === undefined || extra.length > 0 || !isValidProfileId(profile) || (cell !== undefined && !CELL_RE.test(cell))) {
    return null;
  }
  const m = LABEL_RE.exec(label);
  if (m === null || m[1] === undefined || m[2] === undefined) {
    return null;
  }
  const port = Number(m[2]);
  if (port < 1 || port > 65535) {
    return null;
  }
  const protocol = m[1] === 's' ? 'https:' : 'http:';
  const hostname = m[3] === undefined ? 'localhost' : m[3] === 'ip' ? '127.0.0.1' : `${m[3]}.localhost`;
  return { profile, origin: `${protocol}//${hostname}:${port}`, protocol, hostname, port };
}