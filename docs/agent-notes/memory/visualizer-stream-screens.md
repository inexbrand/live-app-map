---
name: visualizer-stream-screens
description: Экраны карты — трансляция с headless Helium вместо iframe; где что лежит и как мерить FPS
metadata:
  node_type: memory
  type: project
  originSessionId: f757e4b2-22ea-4772-bc19-f10da4e0a6de
  modified: 2026-11-24T14:21:05.657Z
---

С 2026-11-24 iframe в визуализаторе нет: экран — canvas[data-lam-screen] (flow/page-node/ScreenView.tsx), кадры JPEG от сервера трансляции (lib/stream: StreamService на headless Helium через CDP screencast, Bun WebSocket на 4321+, порт — GET /__lam_stream). 12 живых по умолчанию (DEFAULT_MAX_LIVE), остальные — последний кадр/снимок шлюза.

**Why:** пользователь требовал 180 кадров/с при движении камеры; iframe (отдельный процесс отрисовки на экран) перерисовывается на каждом масштабе — недостижимо.

**How to apply:** команды странице — streamClient.post, ответы — streamClient.onPageMessage, ввод — streamClient.input. DOM-тесты — src/test/fake-stream.ts (настоящий WebSocket). FPS мерить на прод-сборке (`bun run start` или срез HEAD в scratchpad) скриптами docs/epoch/live-load-cpu#…/measurements/verify-stream.mjs, verify-input.mjs; dev-режим React съедает ~20 кадров/с на зуме. Пунктир SVG-рёбер дорог на зуме — снимается классом flow-host--zooming. См. [[shared-checkout-no-stash]].
