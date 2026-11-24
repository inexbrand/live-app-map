---
name: sdk-runtime-text-embed
description: Рантайм @live-app-map/sdk вставляется в страницу текстом функций (toString) — правила для правок runtime/*
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-24T23:56:23.350Z
---

Рантайм SDK (packages/sdk/src/runtime/*) не собирается для браузера: lamVite вставляет в начало <head> текст функций (fn.toString()), как пикер шлюза визуализатора. Функции пикера (fiberOf, debugPlaceOf, componentNameOf…) живут в sdk/runtime/fiber.ts, пикер их реэкспортирует.

**Why:** обычный скрипт выполняется до модулей приложения (подмена fetch/XHR успевает), не нужен fs.allow и отдельный бандл в tarball.
**How to apply:** в runtime/* — без замыканий на модуль и импортов значений внутри тел, имена функций уникальны (иначе сборщик переименует); новую функцию добавь в список lamRuntimeScript. Тест «после bun build» в packages/sdk/test/runtime.test.ts это ловит. Порты 4421+ может занять процесс визуализатора :4310 (утечка портов трансляции) — проверяй netstat. Тесты happy-dom (useDom) ломают fetch к Bun.serve — сетевые тесты стора держи в файле без DOM. См. [[visualizer-stream-screens]], [[shared-checkout-no-stash]].
