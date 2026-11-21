import { eden, rpc } from '../api';
import { createSharedClient } from '../stores/shared-client';

/** Экран профиля в мини-приложении. */
export function Profile(props: { readonly id: string }) {
  void eden.users({ id: props.id }).get();
  void eden.users.get();
  void rpc.orders.$post({ json: {} });
  void rpc.health.$get();
  void createSharedClient().me();
  return <div />;
}
