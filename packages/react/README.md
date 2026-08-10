# `@live-app-map/react`

## Роль

React-embed Live App Map: headless-загрузка graph JSON, summary-view и плавающий Devtools-shell.
Полноценный canvas (граф + iframe-budget) — в `apps/visualizer-spa` (порт **4310**); этот пакет — встраивание в host-приложение.

Peer: React 19 / React DOM 19.

## Публичный API

| Экспорт | Назначение |
|---------|------------|
| `LiveAppMap` | Embed: `document` или `graphUrl` → loading / error / summary |
| `LiveAppMapView` | Презентация без fetch (удобно для unit) |
| `fetchAppMapDocument` | `fetch` + `parseAppMapDocument` (граница сети/схемы) |
| `LiveAppMapDevtools` | Плавающая кнопка (только non-production) |
| `LiveAppMapDevtoolsPanel` | Презентация Devtools без hooks |
| `LIVE_APP_MAP_COPY` | RU-строки UI |
| `LiveAppMapProps`, `FetchAppMapResult`, `DevtoolsProps`, `DevtoolsPanelProps` | Типы |

Импорт:

```ts
import {
  LiveAppMap,
  LiveAppMapDevtools,
  fetchAppMapDocument,
} from '@live-app-map/react';
```

## Пример

```tsx
import { LiveAppMap, LiveAppMapDevtools } from '@live-app-map/react';

export function AppShell() {
  return (
    <>
      <LiveAppMap
        graphUrl="/maps/korbor-miniapp.liveappmap.json"
        baseUrl="http://localhost:5175"
        mode="map-only"
      />
      <LiveAppMapDevtools position="bottom-right" />
    </>
  );
}
```

Готовый `document` (без сети):

```tsx
<LiveAppMap document={parsedDocument} mode="compact" />
```

## Тесты

```bash
# из корня monorepo
bun test packages/react

# из каталога пакета
cd packages/react && bun test
```

Скрипт `typecheck`: `bun run typecheck` (в каталоге пакета).
