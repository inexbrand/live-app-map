# 02 — ресерч

- Холст: `apps/visualizer-spa/src/flow/AppMapCanvas.tsx` — `canvasView` → `filterCanvasGraph` (`canvas-graph.ts`, виды page/not-found/external/service) → `layoutCanvas` (`canvas-layout.ts`, группа `SERVICES_GROUP` «Сервисы бэкенда») → `flowNode`/`flowEdge`.
- `ServiceNode.tsx`: одна точка входа `Handle target Left` — туда сходятся все рёбра.
- Рёбра API: `kind: 'api'`, экран → `service:@korbor/api`, `metadata.routeIds` — id роутов из `doc.code.routes` (`ApiRoute.id`).
- Домены: `apiDomains` (`packages/graph/src/api-domains.ts`), уже в виде «API».
- Цифры korbor (map.json): 315 роутов, 48 доменов, 76 рёбер API → 186 пар экран–домен, промахов id 0. auth: 31 роут / 12 экранов; registry: 4 / 36.

## Покрытие
- есть: связь экран → сервис, число роутов в подписи; нет: какой предмет API вызывает экран, кто вызывает данный раздел API.
- дыра: в группе «Сервисы бэкенда» все пакеты монорепо (i18n, logger…) с нулями — шум.
