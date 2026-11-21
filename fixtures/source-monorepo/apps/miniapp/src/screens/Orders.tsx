/** Экран заказов мини-приложения (грузится лениво). */
export function OrdersScreen() {
  void fetch('/v1/orders/count');
  return <div />;
}
