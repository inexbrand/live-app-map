---
name: stream-browser-persistent
description: "Браузер трансляции — постоянный headless Helium вне vite (CDP :9341), вкладки переживают перезапуск vite, гасится browser:stop"
metadata:
  node_type: memory
  type: project
  originSessionId: 4cffdc2b-4185-4f5f-bcc7-099228f97712
  modified: 2026-11-25T13:38:14.917Z
---

С 2026-11-25 браузер трансляции экранов — отдельный процесс Helium (lib/stream/stream-browser.ts): CDP :9341 или LAM_STREAM_CDP_PORT (e2e — 9333), профиль %LOCALAPPDATA%/live-app-map/stream-browser/<порт>. vite подключается connectOverCDP, контекст — contexts()[0] (дисковый кэш). Вкладки владельца (vite-<порт>) записаны в lam-tabs-<владелец>.json в профиле (targetId → ключ, адрес, итог шагов); новый сервис подхватывает их без перехода, невостребованные закрывает через 20 с. Адрес экрана — без ячейки ноды (общий origin).

**Why:** перезапуск vite: первые кадры 7 экранов korbor 13–22 с → 1,2–2,5 с; браузер погашен, кэш тёплый — 8,7 с.

**How to apply:**
- Тесты stream/* ходят в тот же постоянный браузер :9341: в afterAll сначала `service.sync([])`, потом close() — иначе вкладки теста висят вечно (close() только отключается).
- Убитый vite оставляет свои вкладки в браузере до следующего запуска на том же порту или `bun run browser:stop`.
- Куки и localStorage экранов теперь переживают перезапуски — странный вход/состояние: browser:stop и удалить папку профиля.
- taskkill из Git Bash — `taskkill //F //PID n` (иначе MSYS превращает /F в путь).
См. [[visualizer-stream-screens]], [[helium-headless-test-pitfalls]].
