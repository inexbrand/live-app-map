# `@live-app-map/scanner-next`

## Роль

Сканер Next.js: **App Router** + **Pages Router**, ноды page/layout/route-handler, рёбра из литералов (`Link`, `router.push` / `replace`, `redirect`).
Сборка документа — через `@live-app-map/scanner-core` (`assembleDocument`, `walkFiles`, `materializePath`).

## Публичный API

| Экспорт | Назначение |
|---------|------------|
| `scanNextApp` | Полный скан: discover → edges → `ScanResult` |
| `parseSegment` | Парсер имени сегмента App Router |
| `segmentsToPattern` | Сегменты → path pattern + groups / intercept |
| `extractEdgesFromSource` | Literals href / push / redirect → edges |
| `matchRoute` | pathname → route id (dynamic patterns) |
| `humanTitle` | Реэкспорт title-helper из scanner-core |

Контракт входа/выхода: `ScanRequest` / `ScanResult` из `@live-app-map/scanner-core`.

```ts
import { scanNextApp } from '@live-app-map/scanner-next';
```

## Пример

```ts
import { scanNextApp } from '@live-app-map/scanner-next';

const result = await scanNextApp({
  projectRoot: '../korbor/apps/site',
  baseUrl: 'http://localhost:16001',
  exampleParams: {
    id: 'demo',
    byRoute: {
      '/blog/[slug]': { slug: 'hello' },
    },
  },
  includeRouteHandlers: false,
});

console.log(
  result.document.nodes.length,
  result.document.edges.length,
  result.diagnostics.map((d) => d.code),
  result.timing.totalMs,
);
```

Hybrid App+Pages → `framework: 'hybrid'` и diagnostic `HYBRID_ROUTER`.

## Тесты

```bash
# из корня monorepo
bun test packages/scanner-next

# из каталога пакета
cd packages/scanner-next && bun test
```
