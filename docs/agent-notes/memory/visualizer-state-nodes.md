---
name: visualizer-state-nodes
description: "Узлы-состояния экранов в визуализаторе — где живут, почему index.document, грабли живой проверки"
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-24T23:43:43.262Z
---

С 2026-11-25 состояния по контракту sdk (у состояния есть id) — отдельные узлы `<экран>@state:<id>` рядом с экраном (lib/state-nodes.ts). Они есть только в `index` store (index.document), не в `document`: холст (AppMapCanvas) и бюджет живых (iframe-budget) читают index.document, экспорт/сравнение/API — document. Шаги — lib/stream/state-steps.ts, общий для StreamService и SnapshotService; итог шагов — сообщение `{t:'steps'}` трансляции → store.stepErrors.

**Why:** в store.document узлы-состояния попали бы в экспорт, сравнение и счётчики экранов.
**How to apply:** новый потребитель «экранов холста» — бери index.document. Живая проверка в общем checkout: правки тиммейтов перезагружают страницу своего vite и закрывают страницы трансляции посреди шагов — повторяй замер, не верь одиночному сбою. В `$`-шаблоне не вставляй ${путь} внутрь JS-строки bun -e — пиши скрипт файлом. См. [[visualizer-stream-screens]], [[helium-headless-test-pitfalls]], [[shared-checkout-no-stash]].
