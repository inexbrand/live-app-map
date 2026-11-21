import { Profile } from './screens/Profile';

/** Загрузчики экранов по id. */
const LOADERS = {
  orders: () => import('./screens/Orders').then((m) => ({ Component: m.OrdersScreen })),
};

function lazyRoute(id: 'orders') {
  return async () => LOADERS[id]();
}

/** Дерево роутов React Router мини-приложения. */
export const routes = [
  {
    path: '/',
    children: [
      { path: 'profile/:id', element: <Profile id="1" /> },
      { path: 'orders', lazy: lazyRoute('orders') },
    ],
  },
];
