import { useMemo } from 'react';
import { createSharedClient } from '../stores/shared-client';
import { createWalletStore } from '../stores/wallet-store';

/** Таб кошелька: стор создаётся в useMemo, тип стора сканеру не виден. */
export function WalletScreen() {
  const store = useMemo(() => createWalletStore(), []);
  const client = createSharedClient();
  void store.load();
  void client.me();
  return <div />;
}
