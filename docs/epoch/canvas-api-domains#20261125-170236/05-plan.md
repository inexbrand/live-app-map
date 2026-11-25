# 05 — план

1. Тест `api-domain-graph.test.ts` (красный).
2. `flow/api-domain-graph.ts`: `withApiDomains(doc)` — ноды доменов вместо сервисов, рёбра экран → домен.
3. `ApiDomainNode.tsx` + стили; `canvasView` применяет `withApiDomains`, `flowEdge` скрывает API-рёбра не у выбранного; заголовок группы «API».
4. Правка canvas.test.tsx, прогон тестов flow, tsc.
5. Живая проверка на korbor, коммит, пуш.
