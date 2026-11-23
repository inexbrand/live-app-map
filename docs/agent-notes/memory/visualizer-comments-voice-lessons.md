---
name: visualizer-comments-voice-lessons
description: "Грабли замечаний к компонентам и голоса Whisper в визуализаторе — снимок, пикер React 19, загрузка моделей, e2e"
metadata:
  node_type: memory
  type: project
  originSessionId: f46ea38b-6432-4981-968d-f8720dc189d7
  modified: 2026-11-21T19:34:24.844Z
---

Неочевидное из задачи «замечания к экранам + голос» (2026-11-21, ветка design-expert-task-4bfc7360):

- Снимок TabGrabber: `requestVideoFrameCallback` у неподвижной вкладки не срабатывает — ждать кадр с пределом (250 мс).
- React 19: у fiber нет `_debugSource`, есть `_debugStack`; позиция в стеке — в коде, отданном Vite, нужна sourcemap
  (страница читает свой модуль). Элементы UI-кита — подниматься по `_debugOwner` до кода приложения.
- Путь из стека — от корня приложения; к корню кода приводит `codeFileOfNode` из schema.
- Node http: `req` «close» у GET приходит сразу — обрыв загрузки вешать на `res` «close», иначе write after destroy роняет vite.
- Зависимость, которую импортирует только воркер (transformers), обязана быть в optimizeDeps.include: иначе свежий Vite
  перезагружает страницу при первом использовании; проверять чистое состояние через `vite --force` в основном checkout.
- e2e не должен удалять модели на сервере: env из playwright.config не действует на уже запущенный dev (reuseExistingServer).
- Playwright: `locator.textContent()` без элемента ждёт до таймаута теста — в опросах сначала `count()`.
- Полный e2e без `KORBOR_DIR` в env dev-сервера валит compare.e2e (скан проекта).
- При 1024×700 между панелями ~220 px: новые кнопки — в шапку ноды, не в боковые панели (overlap.e2e).
- Тесты разных воркеров делят состояние агента: просьба снимка из snapshot.e2e может занять сессию в чужой вкладке.

Связано: [[visualizer-ux-overhaul-lessons]], [[visualizer-dev-runtime]], [[large-file-edit-tooling]].
