/** Стор заказов с интерфейсом: метод `load` есть и у стора кошелька. */
export interface OrdersStore {
  load(): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
}

export function createOrdersStore(): OrdersStore {
  return {
    load: () => fetch('/v1/orders-store'),
    cancel: (id: string) => fetch(`/v1/orders-store/${id}`, { method: 'DELETE' }),
  };
}
