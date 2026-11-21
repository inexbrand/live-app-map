# Research

## Замер до (master e7ad1d4)

- dryer --threshold 0.8 apps packages: 24 пары (e2e 7, visualizer-spa lib/ui/store 9, mcp-server 5, scanner-docs 1, scanner-next 1, scanner-source 1, graph 1). Файл: scratchpad dry-before.edn.
- crapper (покрытие bun test --coverage): 367 функций с CRAP ≥ 10 из ~1021; худшие — React-компоненты без unit-покрытия (MapToolbar 11130, PageNodeInner 8010, DocGraphCanvas 7482).
- Файлы > 300 строк (без тестов): app-store 958, MapToolbar 670, PageNode 669, scanner-next/index 604, pick-script 512, ApiView 471, viewport 464, export-appmap 444, scanner-core 430, route-input 420, schema/types 401, doc-graph 394, scanner-react-router 387 и др.
- unit: до правок 45 падений — мок fetch из packages/react/src/live-app-map.test.tsx утекал в остальные файлы (mock.restore не откатывает присваивание). Исправлено первым коммитом: 662/662.
- Тесты с сокетами (middleware, шлюз) в песочнице не проходят — запускать без песочницы.

## Покрытие задачи

| Пункт | Что покрыть |
|---|---|
| 1 шапка | кнопка-вкладка, пункт меню, данные вкладок списком, мелкие компоненты |
| 2 MCP | общие ok/fail, чтение аргументов, mapPath, описание+обработчик в одном месте |
| 3 dev-сервер | общий readJson/sendJson/ошибки/origin для 16 middleware |
| 4 клиент API | один типизированный клиент вместо ручного fetch в 13 файлах |
| 5 e2e | общая подготовка в фикстуры |
| 6 сканеры и lib | пары dryer по списку |
| 7 файлы > 300 | разбить по ответственности |
