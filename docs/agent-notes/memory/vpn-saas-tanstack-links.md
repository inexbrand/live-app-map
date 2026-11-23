---
name: vpn-saas-tanstack-links
description: "В vpn-saas (TanStack Router) переходы экранов лежат во вложенных импортах, а не в файле маршрута"
metadata:
  node_type: memory
  type: project
  originSessionId: 0f2bc961-54cb-441d-9cd1-5e4f7900c9a6
  modified: 2026-11-21T15:10:50.095Z
---

vpn-saas admin и miniapp — TanStack Router с маршрутами в коде (createRoute + getParentRoute, lazyRouteComponent). Компонент маршрута — обёртка (device-route.tsx → device-page.tsx → bound-device-row.tsx), Link/navigate лежат на 1–3 импорта глубже. Общий виджет audit-event-panel.tsx стоит на ~10 экранах admin и ссылается на сущности — даёт 106 «низких» переходов из 136.

**Why:** без обхода импортов сканер видел 24 перехода на 56 экранов; без отсечения общих файлов каждый экран связан со всеми через оболочку.
**How to apply:** сканер scanner-react-router/src/tanstack.ts обходит импорты до глубины 3 и отбрасывает файлы, общие для > ¼ экранов; ссылки через переменные (`to: path`) не видны. Цифры — в эпохе live-korbor-e2e#20261121-175119. См. [[korbor-frontend-api-clients]].
