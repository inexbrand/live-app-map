# 07 — журнал

- Тест `flow/api-domain-graph.test.ts` (красный: нет модуля) → `flow/api-domain-graph.ts` `withApiDomains` → зелёный.
- `canvas.test.tsx`: тест «API по доменам…» и правка первого теста (красные: 2 fail) → `AppMapCanvas.tsx` (withApiDomains до фильтра, hidden у API-рёбер), `ServiceNode.tsx` (иконка Route, «экраны N»), `canvas-layout.ts` (заголовок «API») → зелёные.
- Файл canvas.test.tsx больше лимита чтения context-mode — правка скриптом bun из scratchpad.
