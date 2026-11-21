/** Общий клиент: им пользуются все экраны, каждому достаются только его методы. */
export function createSharedClient() {
  return {
    me: () => fetch('/v1/me'),
    ping: () => fetch('/v1/ping'),
  };
}
