---
name: live-ui-check-playwright-core
description: "Живая проверка вида визуализатора скриптом — где лежит playwright-core, как открыть карту korbor и вид без URL-параметра"
metadata:
  node_type: memory
  type: reference
  originSessionId: 2af31436-1760-4e5f-b140-98ed236351ce
  modified: 2026-11-25T08:41:00.162Z
---

playwright-core в монорепо не поднят в node_modules: только `node_modules/.bun/playwright-core@<версия>/node_modules/playwright-core/index.mjs` — скрипт из scratchpad импортирует его по абсолютному пути (`ls` в REPL дописывает размер к выводу — путь не брать из ls).
Свой dev: `LAM_PROJECT=C:/work/korbor bun --bun vite --port <свой> --strictPort` в apps/visualizer-spa. На странице сначала экран «Выберите карту проекта» — кнопка `korbor`; вид (`База данных` и др.) — кнопкой в шапке, URL-параметра вида нет. Поиск таблиц нечёткий: «users» оставляет почти все — строку брать по тексту `/^users/`.

**Why:** 2026-11-25 (db-grid) ушло четыре прогона на эти шаги.
**How to apply:** живые проверки вида «База данных» и других. Связано: [[helium-browser-mcp]], [[korbor-local-run]].
