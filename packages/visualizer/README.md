# `@live-app-map/visualizer`

## Роль

Тонкий **re-export** core-утилит visualizer без React Flow host.
Полный UI (граф, live iframe, toolbar) — `apps/visualizer-spa`.
Этот пакет даёт единую точку импорта policy + graph helpers для SPA и embed.

## Re-export (важно)

Пакет **не** реализует логику сам: только пробрасывает символы из:

| Источник | Что реэкспортируется |
|----------|----------------------|
| `@live-app-map/iframe-policy` | `DEFAULT_MAX_LIVE`, `DEFAULT_MAX_PINNED`, `liveDiff`, `reconcile`, `transitionSlot`, типы `PolicyState`, `ViewMode` |
| `@live-app-map/graph` | `applyStateToUrl`, `indexDocument`, `neighbors`, `resolveNodeUrl`, `searchNodes` |

Менять бюджет iframe / индекс графа — в `packages/iframe-policy` и `packages/graph`, не дублировать здесь.

## Публичный API

```ts
import {
  // iframe-policy
  DEFAULT_MAX_LIVE,
  DEFAULT_MAX_PINNED,
  liveDiff,
  reconcile,
  transitionSlot,
  type PolicyState,
  type ViewMode,
  // graph
  applyStateToUrl,
  indexDocument,
  neighbors,
  resolveNodeUrl,
  searchNodes,
} from '@live-app-map/visualizer';
```

Эквивалентно прямому импорту из `@live-app-map/iframe-policy` и `@live-app-map/graph`.

## Пример

```ts
import {
  indexDocument,
  reconcile,
  DEFAULT_MAX_LIVE,
  type PolicyState,
} from '@live-app-map/visualizer';
import type { AppMapDocument } from '@live-app-map/schema';

function openSelected(doc: AppMapDocument, selectedId: string) {
  const index = indexDocument(doc);
  const node = index.nodesById.get(selectedId);
  if (node === undefined) {
    return null;
  }

  const state: PolicyState = {
    mode: 'live',
    maxLiveIframes: DEFAULT_MAX_LIVE,
    maxPinned: 2,
    candidates: [selectedId],
    pinned: new Set(),
    visible: new Set([selectedId]),
    selected: selectedId,
    prefetch: new Set(),
    iframeAllowed: { [selectedId]: true },
    recentLiveScore: {},
  };

  return {
    node,
    live: reconcile(state),
  };
}
```

## Тесты

Собственных unit-тестов у пакета нет (только re-export). Поведение покрыто в:

```bash
bun test packages/iframe-policy
bun test packages/graph
bun test apps/visualizer-spa
```

Typecheck пакета:

```bash
cd packages/visualizer && bun run typecheck
```
