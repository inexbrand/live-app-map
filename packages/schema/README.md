# `@live-app-map/schema`

Типы, Zod-схемы, парсинг и конвертация документов **Live App Map** (`formatVersion` **2**; документы v1 читаются и поднимаются `upgradeAppMapDocument`).

Канон продукта: [`docs/live-app-map-enterprise-tdd.md`](../../docs/live-app-map-enterprise-tdd.md) · viewer seed: [`docs/live-app-map-design.md`](../../docs/live-app-map-design.md).

## Два формата

| Формат | Тип | Назначение | Файл / суффикс |
|--------|-----|------------|----------------|
| **enterprise** | `AppMapDocument` | Полный граф сканера (nodes, edges, groups, layout, meta) | `maps/*.json` после `scan` |
| **liveappmap** (viewer) | `LiveAppMapDocument` | Упрощённый граф для SPA (pages + navigation edges) | `*.liveappmap.json` |

Enterprise — **`formatVersion: 2`** (`FORMAT_VERSION`): v1 + раздел `code` (сервисы, символы с комментариями, HTTP-роуты, вызовы БД, таблицы — `code-model.ts`) и нода `kind: 'service'`. Viewer-формат переносит `code` как есть. Enterprise — канон CLI/сканеров; liveappmap — то, что грузит visualizer.

### Конвертация

```ts
import {
  appMapToLiveAppMap,
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
} from '@live-app-map/schema';

// enterprise → viewer
const live = appMapToLiveAppMap(enterpriseDoc);

// viewer → enterprise (import / round-trip)
const enterprise = liveAppMapToAppMap(liveDoc);
```

### Парсинг на границе

- `parseAppMapDocument(unknown)` — Zod + предупреждения (`DUPLICATE_NODE_ID`, `DANGLING_EDGE`)
- `parseLiveAppMapDocument(unknown)` / `parseLiveAppMapJson(text)` — viewer JSON

Результат: `{ ok: true, document, warnings }` или `{ ok: false, errors, warnings }` — без silent fallback.

### Публичный API (кратко)

| Модуль | Что экспортирует |
|--------|------------------|
| `types` | `AppMapDocument`, `LiveAppMapDocument`, nodes/edges/states, `FORMAT_VERSION` |
| `zod` | `appMapDocumentSchema`, `liveAppMapDocumentSchema`, … |
| `parse` | `parseAppMapDocument`, `parseLiveAppMapDocument`, `parseLiveAppMapJson` |
| `convert` | `appMapToLiveAppMap`, `liveAppMapToAppMap`, `isEdgeKind`, `coerceEdgeKind` |

## Проверка

Из корня monorepo:

```bash
bun test packages/schema
bun run --filter '@live-app-map/schema' typecheck
```

Из пакета:

```bash
cd packages/schema
bun test
bun run typecheck
```