---
name: visualizer-ux-overhaul-lessons
description: "Визуализатор: грабли UX-переделки (PR #9) — dev-сервер после rebase, rAF в StrictMode, rebase запушенной ветки, LAM_SHOTS_DIR"
metadata:
  node_type: memory
  type: project
  originSessionId: edcc64b0-354f-419b-b016-347fbae9b553
  modified: 2026-11-21T17:30:20.795Z
---

- После rebase, меняющего схему карт (@live-app-map/schema), **перезапустить dev-сервер**: `/maps/index.json` собирается при старте, старая схема молча кладёт korbor-карты в `skipped` — селект показывает только live-app-map.
- Canvas-рендер с rAF в StrictMode: cleanup обязан обнулять `frame.current` после cancelAnimationFrame, иначе новые кадры не планируются и холст пустой.
- Rebase уже запушенной ветки → push отклонён; force-push запрещён — `git merge origin/<ветка>` с `--ours` (содержимое то же) и проверка `git diff <до слияния> HEAD` пусто.
- `LAM_SHOTS_DIR` читают и ux-flows, и api-docs-views e2e — при полном прогоне в папку падают чужие скриншоты; снимать «после» отдельным прогоном файла.
- Состояние вида в адресе (`view/route/table/doc/screen/docs=graph`, nav-location.ts): один писатель store → history; e2e могут открывать место прямой ссылкой.
- Кнопки поверх шапки ноды ломают клик по `.page-node__title` в 5 e2e (node-scroll, overlap, route-params) — держать кнопки в потоке.

**Why:** на каждом пункте терялось время в задаче ux-overhaul (2026-11-21).
**How to apply:** при правках визуализатора live-app-map и прогоне его e2e. См. [[worktree-git-and-korbor-scan]], [[visualizer-dev-runtime]].
