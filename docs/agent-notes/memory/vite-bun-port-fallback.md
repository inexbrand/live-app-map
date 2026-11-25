---
name: vite-bun-port-fallback
description: "vite под Bun без strictPort копит порты — listen() после EADDRINUSE не завершается, close() отпускает только последний порт"
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-25T00:09:51.969Z
---

Bun 1.4 node:http: после EADDRINUSE повторный listen() занимает порт, но колбэк первого listen не зовётся; listen() на слушающем сервере держит оба порта; close() отпускает только последний. Vite без strictPort перебирает порты через listen(++port) на том же сервере — процесс копит порты, ready/restart виснут. С 2026-11-25 в vite.config.ts визуализатора strictPort (тест src/lib/dev-server-port.test.ts). Шлюз и трансляция при перезапусках vite порты не копят (замер 9 рестартов).

**Why:** визуализатор :4310 держал 4310–4599; гипотеза про плагины замером опровергнута.
**How to apply:** strictPort не убирать; второй dev на занятом порту падает — это верно. Для повторения перезапусков — createServer + server.restart() из файла внутри пакета (из scratchpad vite не резолвится); хук prevent-duplicate-dev не даёт запустить vite с --port занятого порта. См. [[visualizer-dev-runtime]].
