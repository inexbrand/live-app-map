# `@live-app-map/graph`

Индекс, поиск, diff, слои рёбер и резолв live-URL поверх **enterprise** `AppMapDocument` (`@live-app-map/schema`, `formatVersion` 1).

Viewer-формат **liveappmap** сюда не кладётся напрямую: сначала `liveAppMapToAppMap` / `parseAppMapDocument`, затем `indexDocument`.

## Возможности

| API | Назначение |
|-----|------------|
| `indexDocument(doc)` | Immutable `GraphIndex`: maps, adjacency, navigation/structure edges |
| `neighbors(index, id)` | Соседи (in ∪ out ∪ self) |
| `searchNodes(index, query)` | Поиск по id / title / path / url |
| `diffDocuments(left, right)` | Diff нод и рёбер по id (`formatVersion: 1`) |
| `filterEdgesByLayer` / `edgeLayer` | Слои: `navigation` \| `structure` \| `composition` |
| `sortDocument` | Стабильная сортировка для golden/diff |
| `resolveNodeUrl(node, baseUrl)` | Live URL; небезопасный base → `null` |
| `isSafeUrl(url)` | Запрет `javascript:` / `data:` и т.п. |
| `applyStateToUrl(url, inject)` | Query/hash из `StateInjectSpec` (роли, empty, …) |

## Пример

```ts
import { parseAppMapDocument } from '@live-app-map/schema';
import {
  indexDocument,
  searchNodes,
  resolveNodeUrl,
  applyStateToUrl,
} from '@live-app-map/graph';

const parsed = parseAppMapDocument(rawJson);
if (!parsed.ok) {
  throw new Error(parsed.errors.map((e) => e.message).join('; '));
}

const index = indexDocument(parsed.document);
const hits = searchNodes(index, 'vacancies');
const base = 'http://localhost:5175';
const url = resolveNodeUrl(hits[0], base);
if (url !== null) {
  const withRole = applyStateToUrl(url, { query: { lam_role: 'recruiter' } });
}
```

## Проверка

```bash
bun test packages/graph
bun run --filter '@live-app-map/graph' typecheck
```
