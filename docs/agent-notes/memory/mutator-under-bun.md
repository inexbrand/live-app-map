---
name: mutator-under-bun
description: "Как гонять mutator по live-app-map под bun — фильтр путей ./, вывод в файл, группы по тестам, эталонная проверка рефакторинга сканера"
metadata:
  node_type: memory
  type: reference
  originSessionId: 5215243b-b1e3-4105-98ac-58e99cd0f0e9
  modified: 2026-11-22T19:32:46.206Z
---

- Вызов: `mutator --mutate-all --coverage-command "bun test --coverage --coverage-reporter=lcov ./X.test.ts" --test-command "bun test ./X.test.ts" <файлы>`. Без --mutate-all повторяет только выживших и изменённые функции.
- Пути тестов — всегда с `./`: фильтр bun — подстрока, без префикса цепляются копии из target/mutation-workers. В .gitignore — `target/` и `.metrics/`.
- stdout писать в файл (`> out 2>&1; true`): при exit 3 вывод обрезается. Строки `KILLED|SURVIVED|UNCOVERED путь:строка оператор` надёжнее, чем смещения в .metrics/mutate/*.edn.
- Компоненты SPA мутировать группами «файлы → их собственные тесты» по lcov-покрытию (app.test не брать, если есть свой тест): весь SPA ≈ 20 мин, граф (DocGraphView.test, 14 с) — 17 мин один.
- Canvas-рисование проверяется записывающим контекстом: drawGraph принимает узкий тип GraphCanvas (Pick от CanvasRenderingContext2D), тест подаёт класс-регистратор команд.
- Рефакторинг scanner-source проверять эталоном: копия HEAD в .scratch, скан korbor, vpn-saas и fixtures/* старым и новым кодом без generatedAt/durationMs/ms — должно совпасть.
- Остаток выживших у сканера — эквивалентные: `??`→`||` на объектах и непустых строках, `?.` у всегда определённого, сужения типов для TS.

**How to apply:** см. [[agent-tooling-pitfalls-sauger]], [[spa-dom-tests-happy-dom]].

- crapper без флагов берёт покрытие через c8 + npm test — для bun это 0% у всех функций. Звать с `--coverage-command "bun test --max-concurrency=1 --coverage --coverage-reporter=lcov packages apps/visualizer-spa/src scripts" apps packages scripts`.
- Копия кода в .scratch/ (эталон HEAD для сравнения скана) попадает в dryer и crapper: даёт ложные дубли и функции с 0%. Удалять перед замером.
- Долгий цикл mutator по группам в REPL — только внутри awaited-скрипта; брошенный без await цикл обрывается после первого вызова.
- Итог 2026-11-22 (PR #19): scanner-source выжившие 501→213, SPA 731→352; остаток — эквивалентные (?./?? на непустом, начальные значения).
