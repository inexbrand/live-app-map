---
name: helium-headless-test-pitfalls
description: "Headless Helium в тестах визуализатора — режет путь /slow, canvas читается белым, первый переход вкладки обрывается"
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-24T23:01:28.072Z
---

Headless Helium (браузер трансляции и снимков) ведёт себя не как Chromium Playwright:
- путь `/slow` на тестовом Bun.serve блокируется встроенным блокировщиком — переход ERR_ABORTED без запроса к серверу; называй пути иначе (`/late`);
- `getImageData` canvas возвращает белое (защита от отпечатков) — пиксели кадров в тестах декодировать из JPEG (`jpeg-js`);
- после закрытия вкладки с незавершённой загрузкой первый переход новой вкладки обрывается (ERR_ABORTED) — StreamService повторяет переход пустой вкладки.

**Why:** 2026-11-25 три часа ушло на ложные «белые кадры» в тесте, которые давал сам браузер.
**How to apply:** пишешь тест на stream/snapshot — сверяйся со списком. См. [[visualizer-stream-screens]].
