# План реализации

## Шаги

1. Мини-карта: e2e (красный) → minimapSize + пропсы + CSS → зелёный; скриншоты после.
2. Колесо в iframe: e2e (красный) → сообщение wheel в скрипте шлюза + обработчик в PageNode → зелёный.
3. Проверка «целиком»/«окно» на нескольких экранах мини-аппа.
4. Параметры маршрута из API: unit → эндпоинт сервера → подстановка в resolveLiveUrl → живая проверка vacancies/:id.
5. Lint/typecheck по изменённым файлам, отчёт, PR после слияния #4.

## Файлы

- apps/visualizer-spa/src/flow/AppMapCanvas.tsx, flow/minimap.ts (новый), styles/global.css
- apps/visualizer-spa/src/flow/PageNode.tsx, lib/gateway/inject-script.ts
- apps/visualizer-spa/src/lib/gateway/route-params*.ts (новый), store/app-store.ts
- apps/visualizer-spa/e2e/minimap.e2e.ts, e2e/node-scroll.e2e.ts
