import { createOrdersStore } from '../stores/orders-store';

/** Экран заказов мини-приложения (грузится лениво). */
export function OrdersScreen() {
  const store = createOrdersStore();
  void fetch('/v1/orders/count');
  void store.load();
  return <div />;
}
