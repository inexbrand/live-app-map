/**
 * Экраны React Router через scanSource: element/Component, index и children, фабрики роутов,
 * lazy (import, then, карта загрузчиков, фабрика загрузчика), таб по id из карты.
 */
import { expect, test } from 'bun:test';
import { screenLines } from './test/scan-project';

const FILES = {
  "src/home.tsx": "export default function Home() { fetch('/api/home'); return null; }\nexport function HomeNamed() { return null; }\n",
  "src/feed.tsx": "export default function Feed() { fetch('/api/feed'); return null; }\nexport function FeedNamed() { return null; }\n",
  "src/deals.tsx": "export default function Deals() { fetch('/api/deals'); return null; }\nexport function DealsNamed() { return null; }\n",
  "src/lazy1.tsx": "export default function Lazy1() { fetch('/api/lazy1'); return null; }\nexport function Lazy1Named() { return null; }\n",
  "src/lazy3.tsx": "export default function Lazy3() { fetch('/api/lazy3'); return null; }\nexport function Lazy3Named() { return null; }\n",
  "src/lazy5.tsx": "export default function Lazy5() { fetch('/api/lazy5'); return null; }\nexport function Lazy5Named() { return null; }\n",
  "src/paren.tsx": "export default function Paren() { fetch('/api/paren'); return null; }\nexport function ParenNamed() { return null; }\n",
  "src/blockret.tsx": "export default function Blockret() { fetch('/api/blockret'); return null; }\nexport function BlockretNamed() { return null; }\n",
  "src/routes.tsx": "import Home from './home';\nimport Feed from './feed';\nimport Paren from './paren';\nconst LOADERS = { feed: () => import('./feed'), deals: () => import('./deals'), 'quoted': () => import('./lazy5') } satisfies Record<string, unknown>;\nfunction tabRoute(path: string, id: string) { return { path, id }; }\nfunction parenRoute(p: string) { return ({ path: p, element: <Paren /> }); }\nconst blockLoader = (k: string) => { if (!k) { return undefined; } return import('./blockret'); };\nconst byKey = (k: string) => LOADERS[k];\nexport const routes = [\n  { path: '/', element: <Home /> },\n  { path: 'app', children: [{ index: true, element: <Home /> }, { path: 'nested', Component: Feed }, { 'path': '/abs', element: null, Component: Paren }] },\n  tabRoute('feed', 'feed'),\n  tabRoute('none', 'missing'),\n  parenRoute('paren'),\n  { path: 'lazy1', lazy: () => import('./lazy1') },\n  { path: 'lazy3', lazy: () => import('./lazy3').then((m) => ({ Component: m.default })) },\n  { path: 'lazy4', lazy: () => LOADERS['deals']() },\n  { path: 'lazy5', lazy: (LOADERS.quoted) as never },\n  { path: 'lazy6', lazy: () => byKey('feed')() },\n  { path: 'lazy7', lazy: async () => await blockLoader('x') },\n  { path: 'items/:id', element: <Feed /> },\n];\n"
};

const PATHS = ["/","/app","/app/nested","/abs","/feed","/none","/paren","/lazy1","/lazy3","/lazy4","/lazy5","/lazy6","/lazy7","/items/:itemId","/missing"];

test('вызовы экрана по каждому пути конфига', () => {
  const entries = PATHS.map((p) => ({ file: 'apps/x/src/routes.tsx', routePath: p, nodeId: p }));
  expect(screenLines(FILES, entries)).toEqual([
    "apps/x/src/routes.tsx: /api/home via Home",
    "apps/x/src/routes.tsx: /api/home via Home",
    "apps/x/src/routes.tsx: /api/feed via Feed",
    "apps/x/src/routes.tsx: /api/paren via Paren",
    "apps/x/src/routes.tsx: /api/feed",
    "apps/x/src/routes.tsx: /api/home via Home, /api/feed via Feed, /api/paren via Paren",
    "apps/x/src/routes.tsx: /api/paren via Paren",
    "apps/x/src/routes.tsx: /api/lazy1",
    "apps/x/src/routes.tsx: /api/lazy3",
    "apps/x/src/routes.tsx: /api/deals",
    "apps/x/src/routes.tsx: /api/lazy5",
    "apps/x/src/routes.tsx: /api/feed",
    "apps/x/src/routes.tsx: /api/blockret",
    "apps/x/src/routes.tsx: /api/feed via Feed",
    "apps/x/src/routes.tsx: /api/home via Home, /api/feed via Feed, /api/paren via Paren"
  ]);
});
