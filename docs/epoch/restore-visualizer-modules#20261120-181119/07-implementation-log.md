# Implementation log

| Коммит | Что | Почему |
|---|---|---|
| 9c97f49 | schema: экспорт типов viewport, convert без height | typecheck красный во всех 14 пакетах |
| a7b59b7 | mcp-server: ядро + stdio | for-await по ReadableStream; tools нужны dev-серверу |
| 9b3b68b | map-catalog, build-map-catalog-fs, load-map-preset | модули не закоммичены; тесты со старыми id |
| 1963d74 | measure-iframe-height, размер нод React Flow | модуль не закоммичен; старая сигнатура resolveNodeViewport |
| (store tests) | фикстуры AppMapDocument | старая форма документа |
| d906f01 | error-reports / agent-state / mcp middleware | vite.config падал на импорте |
| 99e8df8 | LamGrabHost, SnapshotOverlay, настоящий снимок | компоненты не закоммичены; снимок был рисунком-заглушкой |
| (proxy) | https-path-proxy + proxy-response | `router` не существует в vite |
| 244a431 | vite под Bun, CSS .app-main/.sr-only, input файла | dev не стартовал; холст высотой 0; «Открыть…» не работал |
| (e2e) | snapshot.e2e | проверка захвата в Chromium |
| (fit/ttl) | key ReactFlow по revision; TTL просьб | пустой холст при смене карты; вечная просьба |
| 4b63307 | ErrorBoundary + window.onerror → отчёты | middleware без клиента |
| (cancel) | закрытие потока при отмене во время запроса доступа | утечка индикатора «показ вкладки» |
