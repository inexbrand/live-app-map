/**
 * Разбор TanStack Router: вложенность через getParentRoute, безпутевые
 * обёртки, ленивые компоненты, переходы из экранов и redirect.
 */
import { describe, expect, test } from 'bun:test';
import { linkTargets, parseTanStackRoutes, tanstackToPattern, topLevelProps } from './tanstack';

const routesTsx = `
import { createRootRouteWithContext, createRoute, lazyRouteComponent, redirect, Outlet } from '@tanstack/react-router';
import { LoginPage } from '../pages/login-page.tsx';
const Settings = lazyRouteComponent(() => import('../pages/settings-page.tsx'), 'SettingsPage');
const rootRoute = createRootRouteWithContext<{ a: 1 }>()({ component: Outlet });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async () => { const path = 'x'; return { path }; },
});
const indexRoute = createRoute({ getParentRoute: () => authedRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/clients' }); } });
const clientsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/clients',
  loader: ({ context }) => context.queryClient.ensureQueryData({ path: '/not-a-route' }),
  component: lazyRouteComponent(() => import('../pages/clients-page.tsx'), 'ClientsPage'),
});
const clientRoute = createRoute({ getParentRoute: () => clientsRoute, path: '$clientId', component: lazyRouteComponent(() => import('../pages/client-page.tsx'), 'ClientPage') });
const settingsRoute = createRoute({ getParentRoute: () => authedRoute, path: 'settings', component: Settings });
`;
const files = new Map([
  ['src/app/routes.tsx', routesTsx],
  ['src/pages/login-page.tsx', `export function LoginPage() { return <Link to="/clients">в список</Link>; }`],
  ['src/pages/clients-page.tsx', `navigate({ to: '/clients/$clientId', params }); <Link to={'/settings'} />; <a href="/x" />`],
  ['src/pages/client-page.tsx', `import { Back } from '../widgets/back.tsx';\n<Back />`],
  ['src/widgets/back.tsx', `export function Back() { return <Link\n  to="/clients"\n>назад</Link>; }`],
  ['src/pages/settings-page.tsx', `export const SettingsPage = () => null;`],
  ['src/routes/posts/$postId.tsx', `import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/_layout/posts/$postId')({ component: Post });
function Post() { return <Link to="/clients" />; }`],
]);

describe('parseTanStackRoutes', () => {
  const { routes, links } = parseTanStackRoutes(files);
  const paths = routes.map((r) => r.fullPath).sort();

  test('полные пути по цепочке родителей; безпутевая обёртка и корень — не экраны', () => {
    expect(paths).toEqual(['/', '/clients', '/clients/$clientId', '/login', '/posts/$postId', '/settings']);
  });

  test('компонент экрана: ленивый импорт, импорт по имени, константа lazyRouteComponent', () => {
    const comp = new Map(routes.map((r) => [r.fullPath, r.componentFile]));
    expect(comp.get('/clients')).toBe('src/pages/clients-page.tsx');
    expect(comp.get('/login')).toBe('src/pages/login-page.tsx');
    expect(comp.get('/settings')).toBe('src/pages/settings-page.tsx');
    expect(comp.get('/posts/$postId')).toBe('src/routes/posts/$postId.tsx');
  });

  test('переход из файла экрана — свой, не общий', () => {
    expect(links.every((l) => !l.shared)).toBe(true);
  });

  test('переходы из экранов и redirect; несуществующие пути отброшены', () => {
    const got = links.map((l) => `${l.kind} ${l.fromPath} → ${l.toPath}`).sort();
    expect(got).toEqual([
      'link /clients → /clients/$clientId',
      'link /clients → /settings',
      'link /clients/$clientId → /clients',
      'link /login → /clients',
      'link /posts/$postId → /clients',
      'redirect / → /clients',
    ]);
  });
});

describe('помощники', () => {
  test('topLevelProps не путает вложенные ключи с верхними', () => {
    const p = topLevelProps(`{ path: '/a', loader: () => ({ path: '/b' }), id: 'x' }`);
    expect(p.get('path')).toBe("'/a'");
    expect(p.get('id')).toBe("'x'");
  });

  test('tanstackToPattern', () => {
    expect(tanstackToPattern('/clients/$clientId')).toBe('/clients/[clientId]');
    expect(tanstackToPattern('/files/$')).toBe('/files/[...rest]');
  });

  test('linkTargets', () => {
    expect(linkTargets(`<Link to="/a">` + "navigate({ to: '/b?x=1' })")).toEqual(['/a', '/b']);
  });
});
