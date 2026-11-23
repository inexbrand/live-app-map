---
name: spa-dom-tests-happy-dom
description: Грабли тестов компонентов visualizer-spa на happy-dom + RTL + user-event в bun test
metadata:
  node_type: memory
  type: project
  originSessionId: 77745093-c8e7-4951-8def-3591e79d2936
  modified: 2026-11-22T03:01:27.633Z
---

Тесты компонентов SPA (src/test/dom.ts, fixtures.ts, canvas.ts), выяснено 2026-11-22 в эпохе crap-under-10:
- userEvent.setup() по умолчанию берёт document при загрузке модуля → во втором DOM-файле прогона «Could not determine window of node». Писать userEvent.setup({ document }).
- fireEvent.change у текстовых полей после перерисовок не доходит до React — текст вводить userEvent.type; для select fireEvent.change работает.
- WheelEvent в happy-dom без clientX/clientY — задавать Object.defineProperties и dispatchEvent в act.
- React 19 form action сбрасывает неуправляемые поля после submit — в тестах заполнять все поля перед каждой отправкой.
- После файла теста ждать работу React (setImmediate + setTimeout) до GlobalRegistrator.unregister, иначе «window is not defined» и код выхода 1.
- crapper при упавших тестах считает покрытие 0 — сначала зелёный прогон.
- Вложенные функции (обработчики JSX, колбэки) crapper считает в CC внешней функции.
- DOM-тест без React (код страницы, пикер) всё равно импортирует '@testing-library/react' сразу после dom.ts — иначе её хуки грузятся из afterEach useDom: «Cannot call beforeAll() inside a test».
- В DOM-окружении Response/fetch — от happy-dom: Bun.serve в таком файле падает («Expected a Response object») — поддельный сервер поднимать на node:http.
- Функции, встраиваемые в страницу через toString (pick-dom, pick-source): каждый новый помощник — export и в список pickerScriptText; тест pick-script проверяет, что все вызываемые объявлены.
- React не вешает onError на <iframe> (только load) — обработчик ошибки iframe мёртв; happy-dom сам шлёт iframe событие error («Iframe page loading is disabled»).
- d3-timer (React Flow) запоминает requestAnimationFrame окна первого DOM-файла; dom.ts поэтому не закрывает окно, а abort() его таймеры. Модульный код теста не трогает window на верхнем уровне — во втором DOM-файле его ещё нет (register в beforeAll).
- React Flow рисует все ноды в happy-dom; IntersectionObserver не срабатывает — подменять классом и звать колбэк.
- Холст: installCanvas(reducedMotion) + RecordingContext — журнал вызовов canvas; эталон «до/после» побайтно.

**Why:** без этого тесты падают только в общем прогоне или дают ложные 0% покрытия.
**How to apply:** новые DOM-тесты — через useDom(), within(container), userEvent.setup({ document }). См. [[visualizer-dev-runtime]].