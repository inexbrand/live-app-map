# `@live-app-map/iframe-policy`

**Pure** политика бюджета live-iframe: без DOM, без React. Visualizer (`apps/visualizer-spa`) вызывает `reconcile` / `liveDiff` / `transitionSlot` из store.

См. enterprise TDD §7 (приоритеты pin / selected / visible / prefetch).

## Модель

| Тип | Смысл |
|-----|--------|
| `ViewMode` | `'live'` \| `'map-only'` \| `'compact'` |
| `PolicyState` | mode, лимиты, candidates, pinned, visible, selected, prefetch, scores |
| `ReconcileResult` | `liveIds`, `deferredPins`, `reasons` |
| `IframeSlotState` | FSM: `IDLE` → `LOADING` → `LIVE` / `ERROR` |
| `PriorityReason` | `'pinned'` \| `'selected'` \| `'visible'` \| `'prefetch'` |

Дефолты: `DEFAULT_MAX_LIVE = 8`, `DEFAULT_MAX_PINNED = 6`.

## API

```ts
import {
  reconcile,
  priority,
  liveDiff,
  transitionSlot,
  DEFAULT_MAX_LIVE,
  DEFAULT_MAX_PINNED,
} from '@live-app-map/iframe-policy';

const result = reconcile(policyState);
// result.liveIds — кто реально LIVE при maxLiveIframes

const { load, freeze } = liveDiff(previousLive, result.liveIds);
const next = transitionSlot('IDLE', 'shouldLoad'); // → LOADING
```

### Приоритет (выше → раньше в бюджет)

1. pinned (+1000)
2. selected (+500)
3. visible (+100)
4. prefetch (+20)
5. recency score 0–5

В режиме не-`live` (`map-only` / `compact`) `liveIds` пустой — iframe не поднимаются.

## Проверка

```bash
bun test packages/iframe-policy
bun run --filter '@live-app-map/iframe-policy' typecheck
```
