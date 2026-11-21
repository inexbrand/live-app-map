/** Стор кошелька: методы ходят в API. */
export function createWalletStore() {
  return {
    load: () => fetch('/v1/wallet'),
    topUp: () => fetch('/v1/wallet/top-up', { method: 'POST' }),
  };
}
