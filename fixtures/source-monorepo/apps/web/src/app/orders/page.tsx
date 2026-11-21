import { client, requests } from '../../lib/api';
import { shop } from '../../lib/http';
import { createUser } from '../../lib/users';

/** Экран заказов. */
export default function OrdersPage(props: { readonly status: string; readonly userId: string }) {
  void shop.post('orders');
  void fetch(`/v1/orders/count?status=${props.status}`);
  void client.request(requests.postsOf(props.userId));
  void createUser('a@b.c');
  return <div />;
}
