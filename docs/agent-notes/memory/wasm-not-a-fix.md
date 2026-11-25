---
name: wasm-not-a-fix
description: "WebAssembly не ускорит загрузку визуализатора — счёт на JS ~5 % основного потока, тяжесть в браузере и vite"
metadata:
  node_type: memory
  type: project
  originSessionId: 4cffdc2b-4185-4f5f-bcc7-099228f97712
  modified: 2026-11-25T12:16:44.474Z
---

Замер 2026-11-25 (эпоха wasm-load-speed): после выбора карты korbor основной поток простаивает 93 %, zod 65 мс + dagre 42 мс — всё, что WASM мог бы ускорить. Время уходит на холодную сборку vite (5 с), запуск экранов трансляции, dev-React, перерастеризацию.

**Why:** пользователь спрашивал про WASM для скорости прогрузки.
**How to apply:** на предложение «переписать на WASM/Rust» — сначала профиль CPU (measurements/load-map.mjs); лечить прод-сборкой, ленивой загрузкой map.json, кэшем раскладки. См. [[visualizer-stream-screens]].
