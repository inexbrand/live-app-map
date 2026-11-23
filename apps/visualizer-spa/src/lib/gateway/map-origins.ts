/**
 * Origin приложений карты: из адресов экранов — у них шлюз спрашивает роли
 * автовхода, из них человек выбирает приложение для ручного входа.
 */

/** Origin http(s)-адреса; адрес без схемы или другой схемы — не приложение. */
function httpOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Origin экранов карты, без повторов, по алфавиту.
 *
 * @param nodes - ноды карты
 */
export function mapOrigins(nodes: readonly { readonly url?: string }[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    const origin = n.url === undefined ? null : httpOrigin(n.url);
    if (origin !== null) {
      set.add(origin);
    }
  }
  return [...set].sort();
}
