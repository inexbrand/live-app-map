---
name: visualizer-route-samples
description: Экраны с параметрами маршрута берут реальные id из API под профилем экрана; мини-карта и колесо в нодах — где решения
metadata:
  node_type: memory
  type: project
  originSessionId: 75c94511-1b19-48c5-82ea-579c245f3d7d
  modified: 2026-11-21T16:14:54.680Z
---

С 2026-11-21 (ветка fix/minimap-overflow) визуализатор подставляет в `/vacancies/[id]` и т.п. реальный id: список сущности = GET-роут экрана без последнего `/:param` (рёбра kind=api, metadata.routeIds), запасной — GET-роуты `doc.code.routes`; сервер `POST /__lam_sessions/<профиль>/sample-ids` меняет initData мини-аппа на Bearer (`/api/v1/auth/telegram/miniapp`) и читает списки. После `liveAppMapToAppMap` шаблон пути лежит в `node.metadata.pathPattern`, а `node.pathPattern` — пример.

**Why:** id из скана («demo») давал «Не найдено»; вакансии клиента видны только ему — значение зависит от профиля.

**How to apply:** экраны без списка (13 из 31 в korbor-all) остаются с примером; e2e визуализатора гонять против своего порта (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:4311 PLAYWRIGHT_SKIP_WEBSERVER=1`), :4310 часто занят другим worktree. Размер мини-карты — только style MiniMap (с offsetScale 0), не CSS. См. [[korbor-local-run]], [[visualizer-dev-runtime]].
