/**
 * Привязка карты: адрес кабинета — параметр (пусто — тот же origin), путь — литерал.
 */
export async function postAutoRenew(enabled: boolean, origin: string = '') {
  return fetch(`${origin}/api/cards/auto-renew`, { method: 'POST', body: JSON.stringify({ enabled }) });
}

export function callCards() {
  return postAutoRenew(true);
}
