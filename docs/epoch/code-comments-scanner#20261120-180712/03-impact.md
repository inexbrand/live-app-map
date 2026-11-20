# 03 — Что зависит и риски

- `FORMAT_VERSION` 1 → 2 читают: все сканеры (`buildDocument` в scanner-core), `liveAppMapToAppMap`, тесты schema/cli/graph, `scripts/scan-korbor.ts`, MCP-сервер, export-appmap. Риск: старые карты `formatVersion: 1` в `maps/` и `public/maps`. Меры: Zod принимает 1 и 2, `parseAppMapDocument` поднимает v1 до v2 (`upgradeAppMapDocument`), `runDiff` и `export` идут через тот же парсер.
- Новый `NodeKind = 'service'`: `filterCanvasGraph` и `appMapToLiveAppMap` фильтруют по kind — сервисы надо явно включить, иначе молча пропадут.
- viewer-формат должен переносить раздел `code` в обе стороны, иначе карта из `*.liveappmap.json` потеряет код.
- Восстановление 9 модулей SPA: `vite.config.ts` грузит их при старте dev-сервера, ошибка в любом — визуализатор снова не стартует.
- Зависимость `typescript` переезжает из devDependencies в dependencies пакета scanner-source (нужен в рантайме).
- Скорость: TS Program на весь монорепо (korbor ~600 файлов в api) — секунды; ограничение `maxFiles`.
