# Research

## Замер до (ветка от master 10f9862)

Команда: `crapper --coverage-command "bun test --max-concurrency=1 --coverage --coverage-reporter=lcov packages apps/visualizer-spa/src scripts" apps packages scripts`. Отчёт: scratchpad crap-before.txt.

- функций 1078, CRAP ≥ 10 — 382 (у координатора 387 — другой набор путей); unit 732 pass.
- По областям: visualizer-spa/src 220, scanner-source 61, mcp-server 17, graph 13, scripts 12, e2e 10, scanner-react-router 9, scanner-next 8, cli 6, vite.config 5, scanner-docs 5, остальные по 2–3.
- 202 функции без покрытия вовсе (почти все — React-компоненты и хуки визуализатора, их проверял только e2e).
- ~80 функций покрыты на 100 %, но CC ≥ 10: CRAP = CC, значит нужно разбивать (CC ≤ 9).

## Как crapper считает

Проверено на образцах: CC = 1 + if/?:/&&/||/??/?./case/catch/циклы; **вложенные функции (обработчики, колбэки) входят в CC внешней**; методы объектного литерала не считаются. Значит, у компонента обработчики и вычисления надо выносить в функции модуля или подкомпоненты.
Порог: при 100 % покрытии нужна CC ≤ 9; при CC 5 хватает покрытия > 42 %, при CC 9 — > 77 %.

## Инструменты тестов

Не было DOM в unit: компоненты тестировались только renderToStaticMarkup. Добавлено: happy-dom (@happy-dom/global-registrator) на время файла (src/test/dom.ts — включает до тестов, снимает после, чтобы тесты с fetch/сокетами видели обычный Bun), @testing-library/react, user-event, reassure.
Reassure работает поверх Jest, но его CLI запускает раннер из TEST_RUNNER_PATH — обёртка вызывает bun test для *.perf-test.tsx.

## Покрытие задачи

| Что | Покрыто сейчас | Нужно |
|---|---|---|
| компоненты визуализатора | e2e, без unit | тесты поведения + разбиение |
| хуки (use-*) | нет | renderHook / через компонент |
| сканеры (scanner-source и др.) | тесты есть, функции длинные | разбиение без смены вывода (golden) |
| mcp-server | частично | тесты инструментов + разбиение |
| scripts, cli bin | нет | вынести логику, тесты |
| e2e-хелперы | — | см. 06 |
| perf | нет | Reassure ключевых экранов |
