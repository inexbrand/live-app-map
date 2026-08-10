# `@live-app-map/diagnostics`

Каталог diagnostic codes и форматтеры для CLI / UI Live App Map.

## Назначение

Единый список кодов (`DiagnosticCode`) с severity, русским title/hint.  
Scanner и CLI создают `Diagnostic` через `diag()`, печатают через `formatDiagnostic()`, сортируют через `sortDiagnostics()`.

Зависимость: `@live-app-map/schema` (типы `Diagnostic`, `DiagnosticSeverity`).

## Exports

Из `@live-app-map/diagnostics` (см. `src/index.ts`):

| Export | Тип | Описание |
|--------|-----|----------|
| `DiagnosticCode` | type | union кодов (`NO_ROUTES_FOUND`, `FRAMEWORK_AUTO_DETECT`, …) |
| `diag` | `(code, overrides?) => Diagnostic` | создать diagnostic из каталога |
| `formatDiagnostic` | `(d: Diagnostic) => string` | одна строка для CLI (RU severity) |
| `sortDiagnostics` | `(list) => Diagnostic[]` | error → warning → info, затем code |
| `getCatalog` | `() => Catalog` | полный каталог title/hint/severity |

### Коды (каталог)

`AMBIGUOUS_APP_DIR`, `HYBRID_ROUTER`, `MISSING_EXAMPLE_PARAM`, `UNRESOLVED_TARGET`, `DYNAMIC_HREF`, `EDGE_SCAN_TRUNCATED`, `PARALLEL_LIVE_LIMITATION`, `PIN_DEFERRED`, `NO_APP_DIR`, `NO_ROUTES_FOUND`, `INVALID_BASE_URL`, `FRAMEWORK_AUTO_DETECT`, `DANGLING_EDGE`, `DUPLICATE_NODE_ID`, `SCAN_OK`.

## Пример

```ts
import {
  diag,
  formatDiagnostic,
  sortDiagnostics,
} from '@live-app-map/diagnostics';

const list = sortDiagnostics([
  diag('SCAN_OK'),
  diag('NO_ROUTES_FOUND', {
    message: 'маршруты не найдены в app/',
    file: '/apps/web',
  }),
]);

for (const d of list) {
  console.error(formatDiagnostic(d));
  // [ошибка] NO_ROUTES_FOUND /apps/web: маршруты не найдены в app/
}
```

## Verify

```bash
bun test packages/diagnostics
# или из пакета:
cd packages/diagnostics && bun test
```
