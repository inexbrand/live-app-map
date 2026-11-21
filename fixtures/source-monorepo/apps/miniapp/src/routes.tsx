import { Profile } from './screens/Profile';

/** Загрузчики экранов по id: и для lazy, и для табов, которые рендерит шелл. */
const LOADERS = {
  orders: () => import('./screens/Orders').then((m) => ({ Component: m.OrdersScreen })),
  wallet: () => import('./screens/Wallet').then((m) => ({ Component: m.WalletScreen })),
};

function lazyRoute(id: 'orders' | 'wallet') {
  return async () => LOADERS[id]();
}

/** Таб: путь валиден, а экран рендерит шелл по id (элемента нет). */
function tabRoute(id: 'orders' | 'wallet', path: string) {
  return { id, path, element: null };
}

/** Дерево роутов React Router мини-приложения. */
export const routes = [
  {
    path: '/',
    children: [
      { path: 'profile/:id', element: <Profile id="1" /> },
      { path: 'orders', lazy: lazyRoute('orders') },
      tabRoute('wallet', 'wallet'),
    ],
  },
];
