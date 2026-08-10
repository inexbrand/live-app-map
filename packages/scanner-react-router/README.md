# `@live-app-map/scanner-react-router`

## Роль

Сканер **React Router**: best-effort static extract path-литералов из route config / `createBrowserRouter`-подобных файлов.
Нормализация RR (`:id`, `*rest`) → единый `pathPattern` (`[id]`, `[...rest]`), затем materialize через `@live-app-map/scanner-core`.

Не AST-парсер: regex по исходникам (wave 2). Опционально `entries[]` для явных entry-файлов.

## Публичный API

| Экспорт | Назначение |
|---------|------------|
| `scanReactRouterApp` | Полный скан → `ScanResult` |
| `extractPathsFromSource` | path / tabRoute / Navigate / def(…) литералы |
| `normalizeRrPath` | relative → absolute path |
| `rrToPattern` | `:param` / `*rest` → `[param]` / `[...rest]` |
| `ReactRouterScanOptions` | `ScanRequest` + опциональные `entries` |

```ts
import {
  scanReactRouterApp,
  extractPathsFromSource,
  rrToPattern,
} from '@live-app-map/scanner-react-router';
```

## Пример

```ts
import { scanReactRouterApp } from '@live-app-map/scanner-react-router';

const result = await scanReactRouterApp({
  projectRoot: '../korbor/apps/admin',
  baseUrl: 'http://localhost:16002',
  entries: [
    'src/app/router.tsx',
    'src/features/shell/route-config.ts',
  ],
  exampleParams: {
    dealId: 'demo-deal',
    candidateId: 'demo-candidate',
  },
});

for (const node of result.document.nodes) {
  console.log(node.pathPattern, node.url);
}
```

Если entry-файлы не найдены — diagnostic `NO_ROUTES_FOUND`.

## Тесты

```bash
# из корня monorepo
bun test packages/scanner-react-router

# из каталога пакета
cd packages/scanner-react-router && bun test
```

Покрывает extract (`extract.test.ts`), fixture scan и integration.
