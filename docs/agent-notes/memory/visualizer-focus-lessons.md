---
name: visualizer-focus-lessons
description: "Грабли фокус-режима и замечаний Б3 в visualizer-spa — zustand ?? [], ввод после выбора, тесты трансляции, Base UI в тестах"
metadata:
  node_type: memory
  type: project
  originSessionId: 956ed3aa-9b7e-4053-9bdd-fbe90c20dd19
  modified: 2026-11-24T14:34:27.762Z
---

Выяснено 2026-11-24 при внедрении варианта Б3 ([[screen-feedback-ux-choice]]):
- Селектор zustand с `?? []` / `?? {}` возвращает новый объект на каждый вызов → «Maximum update depth», «Визуализатор упал». Пустое значение — модульная константа.
- Клик, который выбирает экран, включает ввод между pointerdown и pointerup: отпускание уходило в страницу и сразу выбирало компонент. ScreenView шлёт up только после своего down (WeakSet pressed).
- fake-stream: сообщение до подключения сокета теряется — в тесте сначала `await stream.ready()`, иначе тест «зелёный» без проверки. Контроль: убедиться, что тест краснеет без фикса.
- Base UI: ToggleGroup не даёт role="group" (искать по aria-label), Toggle не role="button" в happy-dom; OptionSelect с value '' не подписывает выбранное — «все» = '*'.
- Текст в Input/textarea в DOM-тестах — userEvent.type, fireEvent.change до React не доходит ([[spa-dom-tests-happy-dom]]).
- Живая проверка без miniapp: карта «Сайт» (:16001) — экраны живые; dev на своём порту с LAM_FEEDBACK_DIR в scratchpad.

**Why:** все пять дефектов прошли зелёные тесты и были видны только вживую или после проверки «краснеет ли тест».
**How to apply:** после правок фокуса/замечаний — живой прогон в Helium (клик по экрану, по компоненту, Enter, ⇧C), новые тесты сначала увидеть красными.
